import { describe, expect, it } from 'vitest'
import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'
import { commentDraftWorktreeId } from './comment-draft-worktree'

const worktrees = [
  { id: 'ui', path: '/Sites/muster-ui', repoId: 'r-ui' },
  { id: 'nested', path: '/Sites/muster-ui/packages/web', repoId: 'r-web' },
  { id: 'site', path: '/Sites/client-site', repoId: 'r-site' }
]
const projects: Record<string, number> = { 'r-site': 42 }
const projectFor = (repoId: string) => projects[repoId] ?? null

function draft(over: Partial<BotsCommentDraft>): BotsCommentDraft {
  return { id: 'd', projectId: 7, taskId: 1, ...over } as BotsCommentDraft
}

describe('commentDraftWorktreeId', () => {
  it('stays on the active project when it already shows the draft', () => {
    const d = draft({ agentSource: { agent: 'claude-code', cwd: '/Sites/muster-ui' } })
    expect(commentDraftWorktreeId(d, worktrees, projectFor, 'ui')).toBe('ui')
  })

  it("switches to the agent's project from another one", () => {
    const d = draft({ agentSource: { agent: 'claude-code', cwd: '/Sites/muster-ui/src' } })
    expect(commentDraftWorktreeId(d, worktrees, projectFor, 'site')).toBe('ui')
  })

  it('picks the deepest worktree holding the cwd', () => {
    const d = draft({ agentSource: { agent: 'codex', cwd: '/Sites/muster-ui/packages/web/src' } })
    expect(commentDraftWorktreeId(d, worktrees, projectFor, 'site')).toBe('nested')
  })

  it('uses the recorded worktree id first', () => {
    const d = draft({ agentSource: { agent: 'codex', cwd: '/elsewhere', worktreeId: 'site' } })
    expect(commentDraftWorktreeId(d, worktrees, projectFor, 'ui')).toBe('site')
  })

  it('matches bot drafts by their ActiveCollab project binding', () => {
    expect(commentDraftWorktreeId(draft({ projectId: 42 }), worktrees, projectFor, 'ui')).toBe(
      'site'
    )
  })

  it('returns null when no project shows the draft', () => {
    expect(commentDraftWorktreeId(draft({ projectId: 99 }), worktrees, projectFor, 'ui')).toBeNull()
  })
})
