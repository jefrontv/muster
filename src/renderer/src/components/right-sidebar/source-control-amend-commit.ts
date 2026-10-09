import type { GitConflictOperation, GitUpstreamStatus } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import type { DropdownItem } from './source-control-dropdown-items'
import type { UndoCommitConfirmation } from './source-control-undo-commit'

export type AmendCommitItemInputs = {
  globalBusy: boolean
  hasHeadCommit: boolean
  conflictOperation: GitConflictOperation
  hasUnresolvedConflicts: boolean
  hasMessage: boolean
}

export function resolveAmendCommitItem(inputs: AmendCommitItemInputs): DropdownItem {
  const operationInProgress = inputs.conflictOperation !== 'unknown'
  const title = !inputs.hasHeadCommit
    ? translate(
        'auto.components.right.sidebar.source.control.amend.commit.no_commit',
        'No commit to amend'
      )
    : operationInProgress
      ? translate(
          'auto.components.right.sidebar.source.control.amend.commit.operation_in_progress',
          'Finish or abort the {{value0}} first',
          { value0: inputs.conflictOperation }
        )
      : inputs.hasUnresolvedConflicts
        ? translate(
            'auto.components.right.sidebar.source.control.amend.commit.resolve_conflicts',
            'Resolve conflicts before committing'
          )
        : inputs.hasMessage
          ? translate(
              'auto.components.right.sidebar.source.control.amend.commit.ready',
              'Replace the last commit with the staged changes and this message'
            )
          : translate(
              'auto.components.right.sidebar.source.control.amend.commit.load_message',
              'Load the last commit message to edit, then amend'
            )
  return {
    kind: 'commit_amend',
    label: translate(
      'auto.components.right.sidebar.source.control.amend.commit.label',
      'Commit (Amend)'
    ),
    title,
    disabled:
      inputs.globalBusy ||
      !inputs.hasHeadCommit ||
      operationInProgress ||
      inputs.hasUnresolvedConflicts
  }
}

// Why: amending a local-only commit is harmless; rewriting one the remote already has forces a later Force Push.
export function resolveAmendCommitConfirmation(
  upstreamStatus: GitUpstreamStatus | undefined
): UndoCommitConfirmation | null {
  if (!upstreamStatus?.hasUpstream || upstreamStatus.ahead > 0) {
    return null
  }
  const remote =
    upstreamStatus.upstreamName ??
    translate(
      'auto.components.right.sidebar.source.control.undo.commit.remote_fallback',
      'the remote'
    )
  return {
    title: translate(
      'auto.components.right.sidebar.source.control.amend.commit.confirm_title',
      'Amend a pushed commit?'
    ),
    description: translate(
      'auto.components.right.sidebar.source.control.amend.commit.confirm_description',
      'This commit is already on {{value0}}. Amending it only changes your local branch, and your next push will need Force Push.',
      { value0: remote }
    ),
    confirmLabel: translate(
      'auto.components.right.sidebar.source.control.amend.commit.confirm_label',
      'Amend Commit'
    )
  }
}
