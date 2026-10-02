#!/usr/bin/env node
// A stand-in for `claude -p --input-format stream-json` in chat e2e specs. It
// speaks the same control protocol with no model: answers initialize and other
// control requests, replays user messages, streams a reply, asks permission for
// one Edit, and returns a structured patch. Reads --permission-mode, --resume and --fork-session;
// other flags are ignored. Under the e2e's isolated HOME (or FAKE_CLAUDE_TRANSCRIPT_DIR) it also
// writes a transcript, as the CLI does. FAKE_CLAUDE_SCENARIO=full adds a read, a command, a web
// search and a subagent before the edit; a prompt containing "fail" ends the turn with an error.

const fs = require('node:fs')
const os = require('node:os')
const readline = require('node:readline')
const path = require('node:path')

const flag = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}
const resumed = flag('--resume')
const forked = resumed !== null && process.argv.includes('--fork-session')
// Like the CLI: resuming keeps the session id, forking copies it into a new one.
const sessionId = resumed && !forked ? resumed : `fake-session-${process.pid}`
const transcriptDir =
  process.env.FAKE_CLAUDE_TRANSCRIPT_DIR ??
  (process.env.ORCA_E2E_HOME_DIR ? path.join(os.homedir(), '.claude', 'projects', 'fake') : null)
const transcriptFile = (id) => (transcriptDir ? path.join(transcriptDir, `${id}.jsonl`) : null)
if (transcriptDir && forked && fs.existsSync(transcriptFile(resumed))) {
  fs.mkdirSync(transcriptDir, { recursive: true })
  fs.copyFileSync(transcriptFile(resumed), transcriptFile(sessionId))
}
const cwd = process.cwd()
let initialized = false
let turn = 0
const launchMode = flag('--permission-mode') ?? 'default'
let permissionMode = launchMode === 'manual' ? 'default' : launchMode
/** Resolves with the control_response to our can_use_tool request. */
let awaitingVerdict = null

/** The transcript line a stream record leaves behind, or null for partials and control traffic. */
function transcriptLine(record) {
  const timestamp = new Date().toISOString()
  if (record.type === 'assistant') {
    return { ...record, timestamp }
  }
  if (record.type === 'user') {
    const { tool_use_result: toolUseResult, ...rest } = record
    return { ...rest, timestamp, ...(toolUseResult ? { toolUseResult } : {}) }
  }
  if (record.type === 'result') {
    return { type: 'system', subtype: 'turn_duration', durationMs: record.duration_ms, timestamp }
  }
  return null
}

const out = (record) => {
  process.stdout.write(`${JSON.stringify(record)}\n`)
  const line = transcriptDir ? transcriptLine(record) : null
  if (line) {
    fs.mkdirSync(transcriptDir, { recursive: true })
    fs.appendFileSync(transcriptFile(sessionId), `${JSON.stringify(line)}\n`)
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function reply(request, response) {
  out({
    type: 'control_response',
    response: { subtype: 'success', request_id: request.request_id, response }
  })
}

function control(record) {
  const request = record.request || {}
  switch (request.subtype) {
    case 'initialize':
      return reply(record, {
        commands: [{ name: 'compact', description: 'Compact the conversation', argumentHint: '' }],
        agents: [],
        output_style: 'default',
        available_output_styles: ['default'],
        models: [
          {
            value: 'default',
            displayName: 'Default (recommended)',
            description: 'Fake default',
            supportsEffort: true,
            supportedEffortLevels: ['low', 'medium', 'high']
          },
          { value: 'haiku', displayName: 'Haiku', description: 'Fast', supportsEffort: false }
        ],
        account: { subscriptionType: 'Fake plan' }
      })
    case 'set_permission_mode':
      permissionMode = request.mode
      return reply(record, { mode: request.mode })
    case 'file_suggestions':
      return reply(record, {
        cwd,
        suggestions: ['style.css', 'src/']
          .filter((entry) => entry.includes(request.query || ''))
          .map((entry) => ({ path: entry }))
      })
    case 'get_context_usage':
      return reply(record, { totalTokens: 42_000, maxTokens: 200_000, percentage: 21 })
    default:
      return reply(record, {})
  }
}

function streamText(messageId, index, text) {
  out({
    type: 'stream_event',
    event: { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }
  })
  for (const word of text.split(/(?<= )/)) {
    out({
      type: 'stream_event',
      event: { type: 'content_block_delta', index, delta: { type: 'text_delta', text: word } }
    })
  }
  out({ type: 'stream_event', event: { type: 'content_block_stop', index } })
  out({
    type: 'assistant',
    apiBlockIndex: index,
    message: { id: messageId, role: 'assistant', content: [{ type: 'text', text }] },
    session_id: sessionId
  })
}

/** One tool call and its result, as the CLI records them (call in assistant, result in user). */
function toolPair(messageId, name, input, content, toolUseResult) {
  const id = `fake-${name.toLowerCase()}-${turn}`
  out({
    type: 'assistant',
    message: { id: messageId, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
    session_id: sessionId
  })
  out({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
    ...(toolUseResult ? { tool_use_result: toolUseResult } : {}),
    session_id: sessionId
  })
}

function promptText(record) {
  const content = record.message && record.message.content
  if (typeof content === 'string') {
    return content
  }
  return Array.isArray(content)
    ? content.map((block) => (block && block.type === 'text' ? block.text : '')).join('')
    : ''
}

async function userTurn(record) {
  turn += 1
  if (!initialized) {
    initialized = true
    out({
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      cwd,
      model: 'fake-model',
      permissionMode,
      tools: ['Edit', 'Bash'],
      mcp_servers: [],
      slash_commands: ['compact'],
      claude_code_version: '0.0.0-fake'
    })
  }
  out({ type: 'user', uuid: `fake-user-${turn}`, message: record.message, session_id: sessionId })
  const started = Date.now()
  const messageId = `fake-msg-${turn}`
  out({ type: 'stream_event', event: { type: 'message_start', message: { id: messageId } } })
  streamText(messageId, 0, 'I will switch the header to 100dvh.')

  if (promptText(record).includes('fail')) {
    out({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      duration_ms: Date.now() - started,
      session_id: sessionId
    })
    return
  }
  if (process.env.FAKE_CLAUDE_SCENARIO === 'full') {
    const css = path.join(cwd, 'style.css')
    toolPair(messageId, 'Read', { file_path: css }, '1\t.site-header {')
    toolPair(
      messageId,
      'Bash',
      { command: 'npm run build', description: 'Build the theme' },
      'built in 1.2s',
      { stdout: 'built in 1.2s', stderr: '', interrupted: false }
    )
    toolPair(messageId, 'WebSearch', { query: 'css dvh support' }, 'Results', {
      query: 'css dvh support',
      results: [{ content: [{ title: 'dvh on MDN', url: 'https://developer.mozilla.org/dvh' }] }]
    })
    toolPair(
      messageId,
      'Task',
      { description: 'Check other headers', prompt: 'Look for other 100vh headers' },
      'No other headers use 100vh.'
    )
  }

  const file = path.join(cwd, 'style.css')
  const input = { file_path: file, old_string: 'height: 100vh;', new_string: 'height: 100dvh;' }
  const toolUseId = `fake-tool-${turn}`
  out({
    type: 'stream_event',
    event: {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: toolUseId, name: 'Edit' }
    }
  })
  out({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) }
    }
  })
  out({ type: 'stream_event', event: { type: 'content_block_stop', index: 1 } })
  out({
    type: 'assistant',
    apiBlockIndex: 1,
    message: {
      id: messageId,
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: 'Edit', input }]
    },
    session_id: sessionId
  })

  let allowed = permissionMode === 'acceptEdits' || permissionMode === 'bypassPermissions'
  if (!allowed) {
    const requestId = `fake-perm-${turn}`
    const verdict = new Promise((resolve) => (awaitingVerdict = { requestId, resolve }))
    out({
      type: 'control_request',
      request_id: requestId,
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        tool_use_id: toolUseId,
        input,
        description: 'Switch the header to the dynamic viewport height',
        permission_suggestions: [
          {
            type: 'addRules',
            rules: [{ toolName: 'Edit' }],
            behavior: 'allow',
            destination: 'localSettings'
          }
        ]
      }
    })
    const answer = await verdict
    allowed = answer && answer.behavior === 'allow'
  }

  if (allowed) {
    out({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content: `Updated ${file}` }]
      },
      tool_use_result: {
        filePath: file,
        structuredPatch: [
          {
            oldStart: 3,
            oldLines: 3,
            newStart: 3,
            newLines: 3,
            lines: [' .site-header {', '-  height: 100vh;', '+  height: 100dvh;', ' }']
          }
        ]
      },
      session_id: sessionId
    })
  } else {
    out({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: 'The user declined this edit.',
            is_error: true
          }
        ]
      },
      session_id: sessionId
    })
  }
  await sleep(50)
  const second = `fake-msg-${turn}-b`
  out({ type: 'stream_event', event: { type: 'message_start', message: { id: second } } })
  streamText(
    second,
    0,
    allowed
      ? `Done. The header now uses 100dvh.${forked ? ' (forked session)' : ''}`
      : 'Understood, I left style.css unchanged.'
  )
  out({ type: 'prompt_suggestion', suggestion: 'Run the build' })
  out({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: Date.now() - started,
    total_cost_usd: 0.01,
    session_id: sessionId
  })
}

// FAKE_CLAUDE_BOOT_MS stands in for a slow CLI boot: input waits, in order, until it passes.
const booted = sleep(Number(process.env.FAKE_CLAUDE_BOOT_MS ?? 0))
const lines = readline.createInterface({ input: process.stdin })
lines.on('line', (line) => void booted.then(() => handleLine(line)))

function handleLine(line) {
  let record
  try {
    record = JSON.parse(line)
  } catch {
    return
  }
  if (record.type === 'control_request') {
    control(record)
  } else if (record.type === 'control_response') {
    const response = record.response || {}
    if (awaitingVerdict && response.request_id === awaitingVerdict.requestId) {
      const { resolve } = awaitingVerdict
      awaitingVerdict = null
      resolve(response.response)
    }
  } else if (record.type === 'user') {
    void userTurn(record)
  }
}
lines.on('close', () => void booted.then(() => process.exit(0)))
