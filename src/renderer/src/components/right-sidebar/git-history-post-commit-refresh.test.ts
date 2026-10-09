import { describe, expect, it } from 'vitest'
import { shouldRefreshGitHistoryForStatusHead } from './SourceControl'
import { shouldRefreshGitHistoryAfterCommit } from './git-history-post-commit-refresh'

const BEFORE = 'a'.repeat(40)
const AFTER = 'b'.repeat(40)

describe('shouldRefreshGitHistoryAfterCommit', () => {
  it('leaves the fetch to the status-HEAD effect when status saw the new commit', () => {
    expect(shouldRefreshGitHistoryAfterCommit(BEFORE, AFTER)).toBe(false)
  })

  it('fetches when status still reports the old HEAD', () => {
    expect(shouldRefreshGitHistoryAfterCommit(BEFORE, BEFORE)).toBe(true)
  })

  it('fetches when status has no HEAD before or after the commit', () => {
    expect(shouldRefreshGitHistoryAfterCommit(null, AFTER)).toBe(true)
    expect(shouldRefreshGitHistoryAfterCommit(BEFORE, null)).toBe(true)
  })

  it('pairs with the status-HEAD effect so one commit yields exactly one fetch', () => {
    const cases: [string | null, string | null][] = [
      [BEFORE, AFTER],
      [BEFORE, BEFORE],
      [null, AFTER],
      [BEFORE, null]
    ]
    for (const [before, after] of cases) {
      const effectFetches = shouldRefreshGitHistoryForStatusHead(
        before === null ? null : { baseRef: 'origin/main', statusHead: before, worktreeId: 'wt' },
        { baseRef: 'origin/main', statusHead: after, worktreeId: 'wt' }
      )
      const commitFetches = shouldRefreshGitHistoryAfterCommit(before, after)
      expect(Number(effectFetches) + Number(commitFetches)).toBe(1)
    }
  })
})
