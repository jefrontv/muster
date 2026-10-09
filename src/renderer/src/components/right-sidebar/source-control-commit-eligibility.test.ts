import { describe, expect, it } from 'vitest'
import {
  canSubmitCommit,
  COMMIT_MESSAGE_REQUIRED_REASON,
  isCommitMessageFieldDisabled,
  resolveCommitDisabledReason
} from './source-control-commit-eligibility'

function baseInputs(
  overrides: Partial<Parameters<typeof canSubmitCommit>[0]> = {}
): Parameters<typeof canSubmitCommit>[0] {
  return {
    stagedCount: 1,
    hasPartiallyStagedChanges: false,
    hasMessage: true,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    ...overrides
  }
}

describe('source-control-commit-eligibility', () => {
  it('returns null when commit prerequisites are satisfied', () => {
    expect(resolveCommitDisabledReason(baseInputs())).toBeNull()
    expect(canSubmitCommit(baseInputs())).toBe(true)
    expect(isCommitMessageFieldDisabled(baseInputs())).toBe(false)
  })

  it('keeps the message field enabled when only the message is missing', () => {
    const inputs = baseInputs({ hasMessage: false })
    expect(resolveCommitDisabledReason(inputs)).toBe(COMMIT_MESSAGE_REQUIRED_REASON)
    expect(canSubmitCommit(inputs)).toBe(false)
    expect(isCommitMessageFieldDisabled(inputs)).toBe(false)
  })

  it('allows committing the staged index when files are partially staged', () => {
    const inputs = baseInputs({ hasPartiallyStagedChanges: true })
    expect(resolveCommitDisabledReason(inputs)).toBeNull()
    expect(canSubmitCommit(inputs)).toBe(true)
    expect(isCommitMessageFieldDisabled(inputs)).toBe(false)
  })

  it('keeps the message field enabled when nothing is staged or conflicts exist', () => {
    expect(isCommitMessageFieldDisabled(baseInputs({ stagedCount: 0 }))).toBe(false)
    expect(isCommitMessageFieldDisabled(baseInputs({ hasUnresolvedConflicts: true }))).toBe(false)
  })

  it('disables the message field only while a commit is in flight', () => {
    expect(isCommitMessageFieldDisabled(baseInputs({ isCommitting: true }))).toBe(true)
    expect(isCommitMessageFieldDisabled(baseInputs({ isRemoteOperationActive: true }))).toBe(false)
    expect(isCommitMessageFieldDisabled(baseInputs({ isPullRequestOperationActive: true }))).toBe(
      true
    )
  })
})
