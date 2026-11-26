// The workspace a comment draft belongs to, so Review can switch to the project that shows it.
import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'
import { draftBelongsToScope } from './comment-draft-project-filter'

type WorktreeRef = { id: string; path: string; repoId: string }

export function commentDraftWorktreeId(
  draft: BotsCommentDraft,
  worktrees: readonly WorktreeRef[],
  projectForRepo: (repoId: string) => number | null,
  activeWorktreeId: string | null
): string | null {
  const scopeOf = (w: WorktreeRef) => ({
    worktreeId: w.id,
    worktreePath: w.path,
    projectId: projectForRepo(w.repoId)
  })
  const active = worktrees.find((w) => w.id === activeWorktreeId)
  if (active && draftBelongsToScope(draft, scopeOf(active))) {
    return active.id
  }
  const source = draft.agentSource
  if (source?.worktreeId && worktrees.some((w) => w.id === source.worktreeId)) {
    return source.worktreeId
  }
  // Deepest worktree holding the agent's folder; nested checkouts sit inside project folders.
  const byPath = worktrees
    .filter((w) => source && draftBelongsToScope({ ...draft, projectId: -1 }, scopeOf(w)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (byPath) {
    return byPath.id
  }
  return worktrees.find((w) => projectForRepo(w.repoId) === draft.projectId)?.id ?? null
}
