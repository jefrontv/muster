import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSiteMcpClientForTests, rememberSiteMcpClient } from './site-mcp-client-identity'
import type { SiteMcpContext } from './site-mcp-context'
import { formatPlanFeedback } from '../plan-review-feedback'
import { SITE_MCP_PLAN_TOOLS } from './site-mcp-plan-tools'
import { dispatchSiteMcpTool } from './site-mcp-tools'

const tool = SITE_MCP_PLAN_TOOLS[0]!

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plan-tool-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function context(
  annotatePlan: SiteMcpContext['annotatePlan'],
  sites: { path: string; displayName: string }[] = []
): SiteMcpContext {
  return {
    cwd: dir,
    annotatePlan,
    store: { listSites: () => sites }
  } as unknown as SiteMcpContext
}

const approved = vi.fn(() => Promise.resolve({ requestId: 'r1', round: 1 }))

describe('annotate_plan', () => {
  it('runs off the dispatch chain, because its latency is a person', () => {
    // Why assert this: without it a plan review stalls every other sites tool behind it.
    expect(tool.concurrent).toBe(true)
  })

  it('reads a plan off disk and sends its content, not its path', async () => {
    const path = join(dir, 'plan.md')
    writeFileSync(path, '# Ship it\n\nStep one.')
    const seen: unknown[] = []

    await tool.run(
      context((request) => {
        seen.push(request)
        return Promise.resolve({ requestId: 'r1', round: 1 })
      }),
      { path }
    )

    // The renderer may not be able to resolve a path the MCP process can, so content travels.
    expect(seen[0]).toMatchObject({
      planPath: path,
      title: 'plan.md',
      content: '# Ship it\n\nStep one.'
    })
  })

  it('accepts an inline plan that was never written to disk', async () => {
    const result = (await tool.run(context(approved), { content: '# Inline' })) as {
      plan_path: string | null
    }
    expect(result.plan_path).toBeNull()
  })

  it('refuses both path and content, since only one can be the source of truth', async () => {
    const outcome = await dispatchSiteMcpTool(context(approved), tool, {
      path: join(dir, 'a.md'),
      content: '# b'
    })
    expect(outcome.isError).toBe(true)
  })

  it('refuses neither', async () => {
    const outcome = await dispatchSiteMcpTool(context(approved), tool, {})
    expect(outcome.isError).toBe(true)
  })

  it('reports an unreadable plan instead of showing the user an empty modal', async () => {
    const outcome = await dispatchSiteMcpTool(context(approved), tool, {
      path: join(dir, 'missing.md')
    })
    expect(outcome.isError).toBe(true)
    expect(outcome.content[0]!.text).toContain('Cannot read plan')
  })

  it('takes its round from the queue instead of counting locally', async () => {
    // Why: the queue owns round numbers now, so a plan reviewed through another transport cannot
    // restart the count when the agent comes back through MCP.
    const path = join(dir, 'plan.md')
    writeFileSync(path, 'first draft')
    const seen: { round?: number; previousContent?: string | null }[] = []
    const capture = context((request) => {
      seen.push({ round: request.round, previousContent: request.previousContent })
      return Promise.resolve({ requestId: 'r1', round: 7 })
    })

    const result = (await tool.run(capture, { path })) as { round: number }

    expect(seen).toEqual([{ round: undefined, previousContent: undefined }])
    expect(result.round).toBe(7)
  })
})

describe('review provenance', () => {
  async function capture(sites: { path: string; displayName: string }[] = []) {
    const seen: { agent: string | null; project: string | null }[] = []
    await tool.run(
      context((request) => {
        seen.push({ agent: request.agent, project: request.project })
        return Promise.resolve({ requestId: 'r1', round: 1 })
      }, sites),
      { content: '# Plan' }
    )
    return seen[0]!
  }

  it('names the site that owns the working directory', async () => {
    expect((await capture([{ path: dir, displayName: 'Acme' }])).project).toBe('Acme')
  })

  it('prefers the deepest match, so a worktree beats a shared parent prefix', async () => {
    const seen = await capture([
      { path: dir, displayName: 'Deep' },
      { path: tmpdir(), displayName: 'Shallow' }
    ])
    expect(seen.project).toBe('Deep')
  })

  it('does not treat a sibling sharing a name prefix as the owning site', async () => {
    // `${dir}-other` starts with `dir`; a bare startsWith would claim it.
    expect((await capture([{ path: `${dir}-other`, displayName: 'Sibling' }])).project).not.toBe(
      'Sibling'
    )
  })

  it('falls back to the directory name for a checkout Muster does not manage', async () => {
    expect((await capture()).project).toBe(basename(dir))
  })

  it('reports the agent the handshake named, and null when it named none', async () => {
    clearSiteMcpClientForTests()
    expect((await capture()).agent).toBeNull()
    rememberSiteMcpClient({ name: 'claude-code' })
    expect((await capture()).agent).toBe('claude-code')
  })
})

describe('formatPlanFeedback', () => {
  it('quotes the passage so the agent can find it after the plan moves', () => {
    const text = formatPlanFeedback({
      decision: 'annotated',
      annotations: [
        { kind: 'comment', quote: 'ship on Friday', startLine: 8, endLine: 8, body: 'no' }
      ]
    })
    // Line numbers drift between rounds; the quote is what survives a rewrite.
    expect(text).toContain('> ship on Friday')
    expect(text).toContain('line 8')
    expect(text).toContain('no')
  })

  it('marks saved edits so the agent does not re-apply them', () => {
    const text = formatPlanFeedback({
      decision: 'approved_with_notes',
      annotations: [],
      edits: { unifiedDiff: '@@ -1 +1 @@\n-a\n+b', appliedToDisk: true }
    })
    expect(text).toContain('already saved')
  })

  it('says so plainly when an approval carried no notes', () => {
    expect(formatPlanFeedback({ decision: 'approved', annotations: [] })).toContain('no changes')
  })
})

describe('collect_plan_review', () => {
  const collectTool = SITE_MCP_PLAN_TOOLS.find((entry) => entry.name === 'collect_plan_review')!

  function collectContext(
    collectPlanReview: SiteMcpContext['collectPlanReview'],
    progress?: SiteMcpContext['progress']
  ): SiteMcpContext {
    return {
      cwd: dir,
      collectPlanReview,
      progress,
      store: { listSites: () => [] }
    } as unknown as SiteMcpContext
  }

  it('runs off the dispatch chain, because this is the call a person is inside of', () => {
    expect(collectTool.concurrent).toBe(true)
  })

  it('reports pending as normal and tells the agent to keep calling', async () => {
    const result = (await collectTool.run(
      collectContext(() =>
        Promise.resolve({ status: 'pending', openedMs: 50_000, shownMs: 42_000, queuedAhead: 0 })
      ),
      { review_id: 'r1' }
    )) as { status: string; user_state: string; open_for_seconds: number; next_step: string }
    expect(result.status).toBe('pending')
    expect(result.user_state).toBe('reading')
    expect(result.open_for_seconds).toBe(42)
    expect(result.next_step).toContain('Do not open the plan again')
  })

  it('says a review is queued rather than unread when another is in front of it', async () => {
    const result = (await collectTool.run(
      collectContext(() =>
        Promise.resolve({ status: 'pending', openedMs: 90_000, shownMs: null, queuedAhead: 1 })
      ),
      { review_id: 'r1' }
    )) as { user_state: string; queued_ahead: number; open_for_seconds: number }
    expect(result).toMatchObject({ user_state: 'queued', queued_ahead: 1, open_for_seconds: 0 })
  })

  it('tells the agent to stop when the id is unknown', async () => {
    const result = (await collectTool.run(
      collectContext(() => Promise.resolve({ status: 'unknown' })),
      { review_id: 'gone' }
    )) as { status: string; message: string }
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('do not keep polling')
  })

  function holdingCollect(waits: number[]): SiteMcpContext['collectPlanReview'] {
    return async (args) => {
      waits.push(args.waitMs)
      await new Promise((resolve) => setTimeout(resolve, args.waitMs))
      return { status: 'pending', openedMs: 0 }
    }
  }

  it('holds 25s in 10s slices whether or not the client sends a progress token', async () => {
    vi.useFakeTimers()
    for (const progress of [undefined, () => {}]) {
      const waits: number[] = []
      const running = collectTool.run(collectContext(holdingCollect(waits), progress), {
        review_id: 'r1'
      })
      await vi.advanceTimersByTimeAsync(26_000)
      await running
      // A progress token is no promise of a longer deadline, and no bridge request outlives a slice.
      expect(waits).toEqual([10_000, 10_000, 5_000])
    }
    vi.useRealTimers()
  })

  it('sends a progress line between slices and stops once answered', async () => {
    vi.useFakeTimers()
    const sent: { message: string; progress: number }[] = []
    let calls = 0
    const running = collectTool.run(
      collectContext(
        async (args) => {
          calls += 1
          await new Promise((resolve) => setTimeout(resolve, args.waitMs))
          return calls < 3
            ? { status: 'pending', openedMs: 0 }
            : { status: 'settled', result: { decision: 'approved', annotations: [] } }
        },
        (update) => sent.push(update)
      ),
      { review_id: 'r1' }
    )
    await vi.advanceTimersByTimeAsync(26_000)
    const result = (await running) as { status: string }
    expect(result.status).toBe('settled')
    expect(sent.map((update) => update.progress)).toEqual([1, 2])
    vi.useRealTimers()
  })

  it('does not spin on a Muster that answers pending without holding', async () => {
    const waits: number[] = []
    await collectTool.run(
      collectContext((args) => {
        waits.push(args.waitMs)
        return Promise.resolve({ status: 'pending', openedMs: 0 })
      }),
      { review_id: 'r1' }
    )
    expect(waits).toHaveLength(1)
  })

  it('formats the verdict for the agent once it lands', async () => {
    const result = (await collectTool.run(
      collectContext(() =>
        Promise.resolve({
          status: 'settled',
          result: {
            decision: 'approved_with_notes',
            annotations: [
              { kind: 'comment', quote: 'ship Friday', startLine: 4, endLine: 4, body: 'no' }
            ]
          }
        })
      ),
      { review_id: 'r1' }
    )) as { status: string; decision: string; feedback: string }
    expect(result.status).toBe('settled')
    expect(result.decision).toBe('approved_with_notes')
    expect(result.feedback).toContain('> ship Friday')
  })
})
