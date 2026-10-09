import { describe, expect, it } from 'vitest'
import { GIT_HISTORY_MAX_LIMIT, type GitHistoryResult } from '../../../../shared/git-history'
import { canLoadMoreGitHistory, nextGitHistoryLimit } from './git-history-paging'

function result(overrides: Partial<GitHistoryResult>): GitHistoryResult {
  return {
    items: [],
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore: true,
    limit: 50,
    ...overrides
  }
}

describe('nextGitHistoryLimit', () => {
  it('grows by one page', () => {
    expect(nextGitHistoryLimit(50)).toBe(100)
  })

  it('never exceeds the host cap', () => {
    expect(nextGitHistoryLimit(GIT_HISTORY_MAX_LIMIT - 10)).toBe(GIT_HISTORY_MAX_LIMIT)
  })
})

describe('canLoadMoreGitHistory', () => {
  it('offers more when the host reports more commits', () => {
    expect(canLoadMoreGitHistory(result({ hasMore: true, limit: 50 }))).toBe(true)
  })

  it('stops when the branch has no more commits', () => {
    expect(canLoadMoreGitHistory(result({ hasMore: false, limit: 50 }))).toBe(false)
  })

  it('stops at the host cap even when more commits exist', () => {
    expect(canLoadMoreGitHistory(result({ hasMore: true, limit: GIT_HISTORY_MAX_LIMIT }))).toBe(
      false
    )
  })

  it('stays hidden before the first load', () => {
    expect(canLoadMoreGitHistory(undefined)).toBe(false)
  })
})
