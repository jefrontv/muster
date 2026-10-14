// The shipped extension is generated source, so the honest test is to run it: load the module the
// way jiti does, drive it against a real HTTP server speaking the hook contract, and assert what
// the model would see. A source-string assertion here would pin spelling, not behaviour.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPiPlanReviewExtensionSource } from './plan-review-extension-source'

type HookCall = { path: string; token: string | undefined; body: Record<string, unknown> }
type ToolResult = { content: { type: string; text: string }[]; details: Record<string, unknown> }
type ToolUpdate = { content: { type: string; text: string }[] }
type RegisteredTool = {
  name: string
  description: string
  parameters: unknown
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((update: ToolUpdate) => void) | undefined,
    ctx: { cwd: string }
  ) => Promise<ToolResult>
}

const TOKEN = 'hook-token'

const calls: HookCall[] = []
const registered: RegisteredTool[] = []

let mode: 'approved' | 'still-reading' = 'approved'
let collectCount = 0
let server: Server
let dir = ''

function reply(res: ServerResponse, payload: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += String(chunk)
    })
    req.on('end', () => {
      const path = req.url ?? ''
      calls.push({
        path,
        token: req.headers['x-orca-agent-hook-token'] as string | undefined,
        body: raw.length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {}
      })
      if (path === '/hook/plan-review/open') {
        reply(res, { ok: true, review_id: 'review-1', round: 2, queued_ahead: 0 })
        return
      }
      if (path === '/hook/plan-review/collect') {
        collectCount += 1
        if (mode === 'still-reading' && collectCount < 3) {
          // Why the faked clock instead of a sleep: the tool reports progress off Date.now(), and
          // moving time here keeps the test instant rather than sleeping through real seconds.
          vi.setSystemTime(Date.now() + 3_000)
          reply(res, { ok: true, status: 'pending', open_for_seconds: collectCount })
          return
        }
        reply(res, {
          ok: true,
          status: 'settled',
          decision: 'approved',
          feedback: 'Approved with no changes requested.',
          annotations: []
        })
        return
      }
      res.writeHead(404)
      res.end()
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  dir = mkdtempSync(join(tmpdir(), 'plan-review-ext-'))
  const endpointFile = join(dir, 'endpoint.env')
  writeFileSync(endpointFile, `ORCA_AGENT_HOOK_PORT=${port}\nORCA_AGENT_HOOK_TOKEN=${TOKEN}\n`)
  process.env.ORCA_AGENT_HOOK_ENDPOINT = endpointFile
  delete process.env.ORCA_AGENT_HOOK_PORT
  delete process.env.ORCA_AGENT_HOOK_TOKEN

  // Why: the generated source uses require('fs'), which jiti provides in the agent process and
  // plain ESM does not. Supply the same thing here so the module runs unmodified.
  const globalWithRequire = globalThis as typeof globalThis & { require?: NodeJS.Require }
  globalWithRequire.require = createRequire(import.meta.url)

  const sourcePath = join(dir, 'orca-plan-review.mjs')
  writeFileSync(sourcePath, getPiPlanReviewExtensionSource('omp'))
  // Why not a static import: the specifier is a file this test writes at run time, and loading
  // that file the way the agent does is the boundary under test.
  const module = (await import(pathToFileURL(sourcePath).href)) as {
    default: (pi: unknown) => void
  }
  module.default({
    zod: {
      string: () => ({ optional: () => ({ type: 'string' }) }),
      object: (shape: unknown) => shape
    },
    registerTool: (tool: RegisteredTool) => {
      registered.push(tool)
    }
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  calls.length = 0
  collectCount = 0
  mode = 'approved'
})

describe('the shipped plan-review extension', () => {
  it('registers one tool and tells the model to prefer it over the MCP path', () => {
    expect(registered).toHaveLength(1)
    expect(registered[0]!.name).toBe('muster_plan_review')
    expect(registered[0]!.description).toContain('annotate_plan')
    expect(registered[0]!.parameters).toEqual({
      path: { type: 'string' },
      content: { type: 'string' },
      review_id: { type: 'string' }
    })
  })

  it('opens the review, waits, and returns the verdict in one call', async () => {
    const result = await registered[0]!.execute(
      'call-1',
      { path: 'docs/specs/plan.md' },
      undefined,
      undefined,
      { cwd: dir }
    )

    expect(result.content[0]!.text).toContain('no changes requested')
    expect(result.details).toMatchObject({
      status: 'settled',
      review_id: 'review-1',
      round: 2,
      decision: 'approved'
    })
    expect(calls[0]).toMatchObject({ path: '/hook/plan-review/open', token: TOKEN })
    expect(calls[0]!.body).toMatchObject({ path: 'docs/specs/plan.md', cwd: dir, agent: 'omp' })
    expect(calls[1]).toMatchObject({ path: '/hook/plan-review/collect', token: TOKEN })
    expect(calls[1]!.body).toMatchObject({ review_id: 'review-1', wait_ms: 1_500 })
  })

  it('collects a review it did not open, so an interrupted call can be resumed', async () => {
    const result = await registered[0]!.execute(
      'call-2',
      { review_id: 'review-9' },
      undefined,
      undefined,
      {
        cwd: dir
      }
    )

    expect(calls.map((call) => call.path)).toEqual(['/hook/plan-review/collect'])
    expect(calls[0]!.body).toMatchObject({ review_id: 'review-9' })
    expect(result.details).toMatchObject({ status: 'settled' })
  })

  it('keeps looping and reports progress while the person reads', async () => {
    mode = 'still-reading'
    // Why only Date: the tool's progress line is wall-clock based, while its HTTP requests must
    // stay on real sockets.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const updates: string[] = []
      const result = await registered[0]!.execute(
        'call-3',
        { path: 'plan.md' },
        undefined,
        (update) => {
          updates.push(update.content[0]!.text)
        },
        { cwd: dir }
      )

      expect(result.details).toMatchObject({ status: 'settled' })
      expect(calls.filter((call) => call.path === '/hook/plan-review/collect')).toHaveLength(3)
      // Two pending collects move the clock six seconds, which crosses the progress interval.
      expect(updates.length).toBeGreaterThan(0)
      expect(updates[0]).toContain('Waiting for the plan review')
    } finally {
      vi.useRealTimers()
    }
  })

  it('hands back the review id when the user interrupts', async () => {
    mode = 'still-reading'
    const controller = new AbortController()
    controller.abort()
    const result = await registered[0]!.execute(
      'call-4',
      { review_id: 'review-7' },
      controller.signal,
      undefined,
      { cwd: dir }
    )

    expect(result.details).toMatchObject({ status: 'interrupted', review_id: 'review-7' })
    expect(result.content[0]!.text).toContain('review_id "review-7"')
  })

  it('says Muster is unreachable instead of hanging when the endpoint is gone', async () => {
    const saved = process.env.ORCA_AGENT_HOOK_ENDPOINT
    process.env.ORCA_AGENT_HOOK_ENDPOINT = join(dir, 'missing.env')
    try {
      const result = await registered[0]!.execute(
        'call-5',
        { path: 'plan.md' },
        undefined,
        undefined,
        {
          cwd: dir
        }
      )
      expect(result.content[0]!.text).toContain('not reachable')
      expect(calls).toEqual([])
    } finally {
      process.env.ORCA_AGENT_HOOK_ENDPOINT = saved
    }
  })
})
