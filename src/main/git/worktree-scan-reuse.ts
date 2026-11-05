import type { GitWorktreeInfo } from '../../shared/types'

/** How long a bulk sweep (IPC list, auth-root rebuild, runtime resolve) may reuse a completed
 *  `git worktree list` of the same repo. Matches the IPC detected-worktree cache TTL. */
export const BULK_WORKTREE_SCAN_REUSE_MS = 5_000

// Why: launch listed every repo two or three times (IPC sweep, auth-root rebuild, runtime sweep).
// Opt-in bulk readers share one recent result; any invalidation retires it.
const recentWorktreeScans = new Map<string, { worktrees: GitWorktreeInfo[]; at: number }>()
const MAX_RECENT_WORKTREE_SCANS = 1024
let recentWorktreeScanEpoch = 0

export function recentWorktreeScanKey(repoPath: string, wslDistro: string | undefined): string {
  return `${repoPath}\0${wslDistro ?? ''}`
}

export function getRecentWorktreeScanEpoch(): number {
  return recentWorktreeScanEpoch
}

export function readRecentWorktreeScan(key: string, maxAgeMs: number): GitWorktreeInfo[] | null {
  const recent = recentWorktreeScans.get(key)
  return recent && Date.now() - recent.at <= maxAgeMs ? recent.worktrees : null
}

/** Stores a listing unless an invalidation happened after the scan began (`epochAtStart`). */
export function rememberRecentWorktreeScan(
  key: string,
  worktrees: GitWorktreeInfo[],
  epochAtStart: number
): void {
  // Why non-empty only: failures also resolve to [], and a transient failure must not be reused.
  if (worktrees.length === 0 || epochAtStart !== recentWorktreeScanEpoch) {
    return
  }
  recentWorktreeScans.delete(key)
  if (recentWorktreeScans.size >= MAX_RECENT_WORKTREE_SCANS) {
    const oldest = recentWorktreeScans.keys().next().value
    if (oldest !== undefined) {
      recentWorktreeScans.delete(oldest)
    }
  }
  recentWorktreeScans.set(key, { worktrees, at: Date.now() })
}

/** Drop reusable listings for a repo path (all runtimes), or every listing when no path is given. */
export function invalidateRecentWorktreeScans(repoPath?: string): void {
  // Why: a scan that started before this point must not store its now-stale result.
  recentWorktreeScanEpoch += 1
  if (repoPath === undefined) {
    recentWorktreeScans.clear()
    return
  }
  const keyPrefix = `${repoPath}\0`
  for (const key of recentWorktreeScans.keys()) {
    if (key.startsWith(keyPrefix)) {
      recentWorktreeScans.delete(key)
    }
  }
}
