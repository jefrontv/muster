// Which drafts belong to the workspace the user is looking at.
import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { BotsCommentDraft } from '../../../../shared/bots-comment-draft-types'
import { readActiveCollabRepoProject } from '../../../../shared/activecollab-repo-project-binding'
import { useCommentDraftsFeed, type CommentDraftsFeed } from './comment-drafts-feed'

export type CommentDraftScope = {
  worktreeId: string
  worktreePath: string | null
  /** The ActiveCollab project bound to the workspace's repo. */
  projectId: number | null
}

function normalized(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isInside(root: string, path: string): boolean {
  const r = normalized(root)
  const p = normalized(path)
  return p === r || p.startsWith(`${r}/`)
}

export function draftBelongsToScope(draft: BotsCommentDraft, scope: CommentDraftScope): boolean {
  const source = draft.agentSource
  if (source) {
    if (source.worktreeId && source.worktreeId === scope.worktreeId) {
      return true
    }
    if (scope.worktreePath && isInside(scope.worktreePath, source.cwd)) {
      return true
    }
  }
  // Bot drafts (and agent drafts from outside Muster terminals) match by ActiveCollab project.
  return scope.projectId !== null && draft.projectId === scope.projectId
}

export type ScopedCommentDrafts = CommentDraftsFeed & {
  /** Drafts for the active workspace; every draft when no workspace is open. */
  scoped: BotsCommentDraft[]
  /** False when no workspace is open, so there is nothing to filter by. */
  hasScope: boolean
}

export function useScopedCommentDrafts(): ScopedCommentDrafts {
  const feed = useCommentDraftsFeed()
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const worktree = useAppStore((s) => (worktreeId ? s.getKnownWorktreeById(worktreeId) : null))
  const repoProjects = useAppStore((s) => s.settings?.activeCollabRepoProjects)
  const worktreePath = worktree?.path ?? null
  const repoId = worktree?.repoId ?? null

  return useMemo(() => {
    if (!worktreeId) {
      return { ...feed, scoped: feed.drafts, hasScope: false }
    }
    const scope: CommentDraftScope = {
      worktreeId,
      worktreePath,
      projectId: readActiveCollabRepoProject({ activeCollabRepoProjects: repoProjects }, repoId)
    }
    return {
      ...feed,
      scoped: feed.drafts.filter((draft) => draftBelongsToScope(draft, scope)),
      hasScope: true
    }
  }, [feed, worktreeId, worktreePath, repoId, repoProjects])
}
