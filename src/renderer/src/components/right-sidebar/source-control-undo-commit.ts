import type { GitUpstreamStatus } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'

export type UndoCommitConfirmation = {
  title: string
  description: string
  confirmLabel: string
}

// Why: undoing a local-only commit is reversible (changes stay staged), so only a commit the remote already has needs a confirm.
export function resolveUndoCommitConfirmation(
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
      'auto.components.right.sidebar.source.control.undo.commit.confirm_title',
      'Undo a pushed commit?'
    ),
    description: translate(
      'auto.components.right.sidebar.source.control.undo.commit.confirm_description',
      'This commit is already on {{value0}}. Undoing it only changes your local branch, and your next push will need Force Push.',
      { value0: remote }
    ),
    confirmLabel: translate(
      'auto.components.right.sidebar.source.control.undo.commit.confirm_label',
      'Undo Commit'
    )
  }
}

// Why: never overwrite a message the user has started typing.
export function resolveRestoredCommitMessage(currentDraft: string, undoneMessage: string): string {
  return currentDraft.trim() ? currentDraft : undoneMessage
}
