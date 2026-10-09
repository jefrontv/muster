import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { GitConflictOperation } from '../../../../shared/types'
import type { GitSequencerAction } from '../../../../shared/git-sequencer-action'
import {
  readRuntimeGitMergeMessage,
  runRuntimeGitSequencerAction,
  type RuntimeGitContext
} from '@/runtime/runtime-git-client'
import { getConnectionId } from '@/lib/connection-context'
import { translate } from '@/i18n/i18n'

type ConfirmAction = (options: {
  title: string
  description?: string
  confirmLabel?: string
  confirmVariant?: 'default' | 'destructive'
}) => Promise<boolean>

type InProgressOperationParams = {
  worktreeId: string | null
  worktreePath: string | null
  settings: RuntimeGitContext['settings']
  conflictOperation: GitConflictOperation
  isBusy: boolean
  setBusy: (worktreeId: string, busy: boolean) => void
  confirmAction: ConfirmAction
  // Writes the message only when the worktree's commit box is still empty.
  prefillCommitDraft: (worktreeId: string, message: string) => void
  refreshAfterMutation: () => void
}

function confirmationFor(action: GitSequencerAction): Parameters<ConfirmAction>[0] | null {
  if (action === 'rebase-skip') {
    return {
      title: translate(
        'auto.components.right.sidebar.source.control.in_progress.skipConfirmTitle',
        'Skip this commit?'
      ),
      description: translate(
        'auto.components.right.sidebar.source.control.in_progress.skipConfirmDescription',
        'The commit being applied is dropped from the rebased branch, along with any conflict resolutions made for it.'
      ),
      confirmLabel: translate(
        'auto.components.right.sidebar.source.control.in_progress.skipCommit',
        'Skip Commit'
      ),
      confirmVariant: 'destructive'
    }
  }
  if (action === 'cherry-pick-abort') {
    return {
      title: translate(
        'auto.components.right.sidebar.source.control.in_progress.abortCherryPickTitle',
        'Abort cherry-pick?'
      ),
      description: translate(
        'auto.components.right.sidebar.source.control.in_progress.abortCherryPickDescription',
        'This cancels the cherry-pick in progress and can discard conflict resolutions made during it.'
      ),
      confirmLabel: translate(
        'auto.components.right.sidebar.source.control.in_progress.abortCherryPick',
        'Abort cherry-pick'
      ),
      confirmVariant: 'destructive'
    }
  }
  return null
}

function failureTitle(action: GitSequencerAction): string {
  switch (action) {
    case 'rebase-continue':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.continueRebaseFailed',
        'Continue rebase failed'
      )
    case 'rebase-skip':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.skipCommitFailed',
        'Skip commit failed'
      )
    case 'cherry-pick-continue':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.continueCherryPickFailed',
        'Continue cherry-pick failed'
      )
    case 'cherry-pick-abort':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.abortCherryPickFailed',
        'Abort cherry-pick failed'
      )
  }
}

export function useSourceControlInProgressOperation({
  worktreeId,
  worktreePath,
  settings,
  conflictOperation,
  isBusy,
  setBusy,
  confirmAction,
  prefillCommitDraft,
  refreshAfterMutation
}: InProgressOperationParams): {
  runSequencerAction: (action: GitSequencerAction) => Promise<void>
} {
  // Why: prefill once per merge so clearing the box doesn't bring git's message back on the next poll.
  const prefilledMergeWorktreesRef = useRef(new Set<string>())

  useEffect(() => {
    if (!worktreeId || !worktreePath) {
      return
    }
    if (conflictOperation !== 'merge') {
      if (conflictOperation === 'unknown') {
        prefilledMergeWorktreesRef.current.delete(worktreeId)
      }
      return
    }
    if (prefilledMergeWorktreesRef.current.has(worktreeId)) {
      return
    }
    prefilledMergeWorktreesRef.current.add(worktreeId)
    const context = {
      settings,
      worktreeId,
      worktreePath,
      connectionId: getConnectionId(worktreeId) ?? undefined
    }
    void readRuntimeGitMergeMessage(context)
      .then((message) => {
        if (message) {
          prefillCommitDraft(worktreeId, message)
        }
      })
      .catch(() => {
        prefilledMergeWorktreesRef.current.delete(worktreeId)
      })
  }, [conflictOperation, prefillCommitDraft, settings, worktreeId, worktreePath])

  const runSequencerAction = useCallback(
    async (action: GitSequencerAction): Promise<void> => {
      if (!worktreeId || !worktreePath || isBusy) {
        return
      }
      const confirmation = confirmationFor(action)
      if (confirmation && !(await confirmAction(confirmation))) {
        return
      }
      setBusy(worktreeId, true)
      try {
        const result = await runRuntimeGitSequencerAction(
          {
            // Why: route by the repo OWNER host, not the focused runtime.
            settings,
            worktreeId,
            worktreePath,
            connectionId: getConnectionId(worktreeId) ?? undefined
          },
          action
        )
        if (result.stoppedOnConflict) {
          toast.warning(
            translate(
              'auto.components.right.sidebar.source.control.in_progress.stoppedOnConflict',
              'Stopped at another conflict'
            ),
            {
              description: translate(
                'auto.components.right.sidebar.source.control.in_progress.stoppedOnConflictDescription',
                'Resolve and stage the conflicted files, then continue.'
              )
            }
          )
        }
      } catch (error) {
        toast.error(failureTitle(action), {
          description: error instanceof Error ? error.message : String(error)
        })
      } finally {
        setBusy(worktreeId, false)
        refreshAfterMutation()
      }
    },
    [confirmAction, isBusy, refreshAfterMutation, setBusy, settings, worktreeId, worktreePath]
  )

  return { runSequencerAction }
}
