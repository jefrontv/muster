export const COMMIT_MESSAGE_REQUIRED_REASON = 'Enter a commit message to commit' as const

export type CommitEligibilityInputs = {
  stagedCount: number
  hasPartiallyStagedChanges: boolean
  hasMessage: boolean
  hasUnresolvedConflicts: boolean
  isCommitting: boolean
  isRemoteOperationActive: boolean
  isPullRequestOperationActive?: boolean
}

export function resolveCommitDisabledReason(
  inputs: Pick<
    CommitEligibilityInputs,
    'stagedCount' | 'hasPartiallyStagedChanges' | 'hasMessage' | 'hasUnresolvedConflicts'
  >
): string | null {
  if (inputs.hasUnresolvedConflicts) {
    return 'Resolve conflicts before committing'
  }
  if (inputs.stagedCount === 0) {
    return 'Stage at least one file to commit'
  }
  if (!inputs.hasMessage) {
    return COMMIT_MESSAGE_REQUIRED_REASON
  }
  return null
}

function isCommitGloballyBusy(inputs: CommitEligibilityInputs): boolean {
  return (
    inputs.isCommitting ||
    inputs.isRemoteOperationActive ||
    (inputs.isPullRequestOperationActive ?? false)
  )
}

export function canSubmitCommit(inputs: CommitEligibilityInputs): boolean {
  return !isCommitGloballyBusy(inputs) && resolveCommitDisabledReason(inputs) === null
}

// Why: typing never needs anything staged (Commit All stages on submit); only a
// commit in flight locks the box so its submitted text can't drift mid-write.
export function isCommitMessageFieldDisabled(inputs: CommitEligibilityInputs): boolean {
  return inputs.isCommitting || (inputs.isPullRequestOperationActive ?? false)
}
