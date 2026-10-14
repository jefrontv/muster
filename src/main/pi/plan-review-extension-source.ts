// The plan-review tool Muster ships into Pi/OMP: one call, one verdict.
//
// Why an extension and not the MCP tool: OMP/PI give every MCP request a fixed deadline (30 s
// unless the harness config raises it) and never reset it on progress, so a review that takes
// minutes can only be polled through `muster-sites`. A tool registered in-process has no such
// deadline: it opens the review on Muster's agent-hooks server, waits there, and hands back the
// verdict in one call.
//
// Self-contained on purpose — this source runs inside the pi process, loaded by jiti from disk, so
// it imports nothing from Muster and reads the hook endpoint the way the status extension does (a
// KEY=VALUE file, re-read on change because process.env is frozen at PTY spawn).

import type { PiAgentKind } from '../../shared/pi-agent-kind'

export const ORCA_PI_PLAN_REVIEW_EXTENSION_FILE = 'orca-plan-review.ts'

export function getPiPlanReviewExtensionSource(kind: PiAgentKind): string {
  return `// Why a native tool: OMP/PI cap every MCP request at a fixed deadline, so \\\`collect_plan_review\\\`
// over MCP can only poll. This tool waits in-process and returns the verdict in one call.

const OPEN_PATH = '/hook/plan-review/open'
const COLLECT_PATH = '/hook/plan-review/collect'
// Why short collects: Muster's hook server drops a socket that stays idle for five seconds, so
// this loops instead of parking one response on a person. The loop costs no model turn.
const COLLECT_WAIT_MS = 1500
const PROGRESS_EVERY_MS = 5000
const REQUEST_TIMEOUT_MS = 5000
const MAX_TRANSPORT_RETRIES = 6
const AGENT = '${kind}'

let warnedBadEndpoint = false
let cachedEndpointKey = ''
let cachedEndpointValues = null

function readEndpointFile() {
  const path = process.env.ORCA_AGENT_HOOK_ENDPOINT
  if (!path) return null
  try {
    const fs = require('fs')
    try {
      const stat = fs.statSync(path)
      const cacheKey = stat.mtimeMs + ':' + stat.size + ':' + stat.ino
      if (cacheKey === cachedEndpointKey && cachedEndpointValues) return cachedEndpointValues
      const contents = fs.readFileSync(path, 'utf8')
      const out = {}
      for (const line of contents.split(/\\r?\\n/)) {
        // Why one regex: POSIX endpoint.env holds KEY=VALUE, Windows endpoint.cmd holds set KEY=VALUE.
        const m = line.match(/^(?:set\\s+)?([A-Z0-9_]+)=(.*)$/)
        if (m) out[m[1]] = m[2].replace(/\\r$/, '')
      }
      cachedEndpointKey = cacheKey
      cachedEndpointValues = out
      return out
    } catch (ioErr) {
      cachedEndpointKey = ''
      cachedEndpointValues = null
      throw ioErr
    }
  } catch (err) {
    const code = err && err.code
    if (err && code !== 'ENOENT' && !warnedBadEndpoint) {
      warnedBadEndpoint = true
      try {
        console.warn('[muster] cannot read the agent-hooks endpoint file:', err.message)
      } catch {}
    }
    return null
  }
}

function hookCoords() {
  const values = readEndpointFile() || {}
  const port = values.ORCA_AGENT_HOOK_PORT || process.env.ORCA_AGENT_HOOK_PORT
  const token = values.ORCA_AGENT_HOOK_TOKEN || process.env.ORCA_AGENT_HOOK_TOKEN
  return port && token ? { port: port, token: token } : null
}

// One request to Muster. null means "no answer" (not running, refused, or too slow to be useful);
// the caller decides whether that is worth retrying.
async function callMuster(path, body, signal) {
  const coords = hookCoords()
  if (!coords) return null
  const controller = new AbortController()
  const timer = setTimeout(function () {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const onAbort = function () {
    controller.abort()
  }
  const canListen = signal && typeof signal.addEventListener === 'function'
  if (canListen) signal.addEventListener('abort', onAbort)
  try {
    const response = await fetch('http://127.0.0.1:' + coords.port + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Orca-Agent-Hook-Token': coords.token
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    if (canListen) signal.removeEventListener('abort', onAbort)
  }
}

function result(text, details) {
  return { content: [{ type: 'text', text: text }], details: details }
}

function waitingText(elapsedMs, queuedAhead) {
  const seconds = Math.round(elapsedMs / 1000)
  const behind =
    queuedAhead > 0
      ? ' (' + queuedAhead + ' review' + (queuedAhead === 1 ? '' : 's') + ' ahead of yours)'
      : ''
  return 'Waiting for the plan review' + behind + ' \\u2014 ' + seconds + 's so far.'
}

function interruptedResult(reviewId) {
  return result(
    'Review interrupted; it is still open in Muster. Call muster_plan_review again with review_id "' +
      reviewId +
      '" to collect the verdict.',
    { status: 'interrupted', review_id: reviewId }
  )
}

function openFailureText(reply) {
  const code = reply && typeof reply.error === 'string' ? reply.error : 'unreachable'
  if (code === 'no-window') {
    return 'Muster has no window open, so nobody can review the plan. Open Muster and try again.'
  }
  if (code === 'unreadable-plan') {
    return 'Muster could not read that plan file. Check the path and call again.'
  }
  if (code === 'plan-too-large') {
    return 'That plan is too large to hand to a reviewer.'
  }
  if (code === 'bad-request') {
    return "Pass 'path' to a markdown file, or 'content' with the plan text — exactly one of them."
  }
  return 'Muster is not reachable, so the review could not be opened. Start Muster and try again.'
}

export default function (pi) {
  // Why the fallback: pi.zod is the current builder, the typebox shim the legacy one; a host
  // without either simply does not get this tool, and the MCP path still works.
  const schema = pi.zod || pi.typebox
  if (!schema) return
  function optionalString() {
    const value = schema.string()
    return typeof value.optional === 'function' ? value.optional() : value
  }
  let parameters
  try {
    parameters = schema.object({
      path: optionalString(),
      content: optionalString(),
      review_id: optionalString()
    })
  } catch {
    parameters = undefined
  }

  try {
    pi.registerTool({
      name: 'muster_plan_review',
      label: 'Muster plan review',
      description:
        'Open a markdown plan in Muster for the user to review, wait for their verdict, and return it. Prefer this over muster-sites/annotate_plan + collect_plan_review here: it blocks in one call instead of polling. Pass path (preferred) or content to open a review, or review_id to collect one you already opened.',
      parameters: parameters,
      execute: async function (toolCallId, params, signal, onUpdate, ctx) {
        const input = params || {}
        const requested = typeof input.review_id === 'string' ? input.review_id.trim() : ''
        let reviewId = requested
        let round = null
        let queuedAhead = 0

        if (reviewId === '') {
          const cwd = ctx && typeof ctx.cwd === 'string' && ctx.cwd ? ctx.cwd : process.cwd()
          const opened = await callMuster(
            OPEN_PATH,
            {
              path: typeof input.path === 'string' ? input.path : '',
              content: typeof input.content === 'string' ? input.content : '',
              cwd: cwd,
              agent: AGENT
            },
            signal
          )
          if (signal && signal.aborted) return interruptedResult(reviewId)
          if (!opened || opened.ok !== true) {
            return result(openFailureText(opened), { status: 'error' })
          }
          reviewId = String(opened.review_id)
          round = typeof opened.round === 'number' ? opened.round : null
          queuedAhead = typeof opened.queued_ahead === 'number' ? opened.queued_ahead : 0
        }

        const startedAt = Date.now()
        let lastProgressAt = 0
        let transportFailures = 0
        for (;;) {
          if (signal && signal.aborted) return interruptedResult(reviewId)
          const outcome = await callMuster(
            COLLECT_PATH,
            { review_id: reviewId, wait_ms: COLLECT_WAIT_MS },
            signal
          )
          if (signal && signal.aborted) return interruptedResult(reviewId)
          if (!outcome) {
            // Why retry: Muster may be restarting mid-review, and the review survives that.
            transportFailures += 1
            if (transportFailures >= MAX_TRANSPORT_RETRIES) {
              return result(
                'Lost contact with Muster; the review is still open there. Start Muster and call muster_plan_review again with review_id "' +
                  reviewId +
                  '".',
                { status: 'unreachable', review_id: reviewId }
              )
            }
            continue
          }
          transportFailures = 0
          if (outcome.ok !== true) {
            if (outcome.error === 'unknown') {
              return result(
                'That review is no longer collectable (never opened, or its verdict expired). Open a new review.',
                { status: 'unknown', review_id: reviewId }
              )
            }
            return result('Muster refused the collect: ' + String(outcome.error || 'bad-request') + '.', {
              status: 'error',
              review_id: reviewId
            })
          }
          if (outcome.status === 'settled') {
            return result(String(outcome.feedback || 'No feedback.'), {
              status: 'settled',
              review_id: reviewId,
              round: round,
              decision: outcome.decision,
              annotations: outcome.annotations,
              edits: outcome.edits
            })
          }
          const elapsed = Date.now() - startedAt
          if (typeof onUpdate === 'function' && elapsed - lastProgressAt >= PROGRESS_EVERY_MS) {
            lastProgressAt = elapsed
            onUpdate({ content: [{ type: 'text', text: waitingText(elapsed, queuedAhead) }] })
          }
        }
      }
    })
  } catch {
    // Why swallow: an older host without registerTool must not break the agent's session; the MCP
    // tools still cover plan review there.
  }
}
`
}
