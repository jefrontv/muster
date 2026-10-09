import {
  GIT_HISTORY_DEFAULT_LIMIT,
  GIT_HISTORY_MAX_LIMIT,
  type GitHistoryResult
} from '../../../../shared/git-history'

// Why: the history API has no cursor, so "load more" re-reads with a larger limit (one page bigger).
export function nextGitHistoryLimit(currentLimit: number): number {
  return Math.min(GIT_HISTORY_MAX_LIMIT, currentLimit + GIT_HISTORY_DEFAULT_LIMIT)
}

// Why: result.limit is the host-clamped limit, so the row disappears once the host cap is reached.
export function canLoadMoreGitHistory(result: GitHistoryResult | undefined): boolean {
  return (
    Boolean(result?.hasMore) && (result?.limit ?? GIT_HISTORY_MAX_LIMIT) < GIT_HISTORY_MAX_LIMIT
  )
}
