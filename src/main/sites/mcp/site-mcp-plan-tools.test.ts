import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSiteMcpClientForTests, rememberSiteMcpClient } from './site-mcp-client-identity'
import type { SiteMcpContext } from './site-mcp-context'
import {
  clearPlanRoundsForTests,
  formatPlanFeedback,
  SITE_MCP_PLAN_TOOLS
} from './site-mcp-plan-tools'
import { dispatchSiteMcpTool } from './site-mcp-tools'

const tool = SITE_MCP_PLAN_TOOLS[0]!

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plan-tool-'))
  clearPlanRoundsForTests()
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

const approved = vi.fn(() => Promise.resolve({ decision: 'approved' as const, annotations: [] }))

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
        return Promise.resolve({ decision: 'approved', annotations: [] })
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

  it('counts rounds per plan and hands back the previous text to diff against', async () => {
    const path = join(dir, 'plan.md')
    const seen: { round: number; previousContent: string | null }[] = []
    const capture = context((request) => {
      seen.push({ round: request.round, previousContent: request.previousContent })
      return Promise.resolve({ decision: 'annotated' as const, annotations: [] })
    })

    writeFileSync(path, 'first draft')
    await tool.run(capture, { path })
    writeFileSync(path, 'second draft')
    await tool.run(capture, { path })

    expect(seen).toEqual([
      { round: 1, previousContent: null },
      { round: 2, previousContent: 'first draft' }
    ])
  })
})

describe('review provenance', () => {
  async function capture(sites: { path: string; displayName: string }[] = []) {
    const seen: { agent: string | null; project: string | null }[] = []
    await tool.run(
      context((request) => {
        seen.push({ agent: request.agent, project: request.project })
        return Promise.resolve({ decision: 'approved', annotations: [] })
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
