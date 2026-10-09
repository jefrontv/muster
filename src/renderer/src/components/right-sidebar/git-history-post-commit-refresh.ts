// Why: a moved status HEAD already refetches history (the effect agents and terminal commits rely
// on), so a post-commit fetch is only needed when status could not report the move.
export function shouldRefreshGitHistoryAfterCommit(
  statusHeadBeforeCommit: string | null,
  statusHeadAfterRefresh: string | null
): boolean {
  return (
    statusHeadBeforeCommit === null ||
    statusHeadAfterRefresh === null ||
    statusHeadBeforeCommit === statusHeadAfterRefresh
  )
}
