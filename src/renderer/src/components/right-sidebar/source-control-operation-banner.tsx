import React from 'react'
import { GitMerge, GitPullRequestArrow, MoreHorizontal, RefreshCw, SkipForward } from 'lucide-react'
import type { GitConflictOperation } from '../../../../shared/types'
import type { GitSequencerAction } from '../../../../shared/git-sequencer-action'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'

function operationLabel(conflictOperation: GitConflictOperation): string {
  switch (conflictOperation) {
    case 'merge':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.merge',
        'Merge in progress'
      )
    case 'rebase':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.rebase',
        'Rebase in progress'
      )
    case 'cherry-pick':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.cherryPick',
        'Cherry-pick in progress'
      )
    default:
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.operation',
        'Operation in progress'
      )
  }
}

function abortLabel(conflictOperation: GitConflictOperation): string | null {
  switch (conflictOperation) {
    case 'merge':
      return translate('auto.components.right.sidebar.SourceControl.540ca8f78c', 'Abort merge')
    case 'rebase':
      return translate('auto.components.right.sidebar.SourceControl.425f138269', 'Abort rebase')
    case 'cherry-pick':
      return translate(
        'auto.components.right.sidebar.source.control.in_progress.abortCherryPick',
        'Abort cherry-pick'
      )
    default:
      return null
  }
}

function continueAction(
  conflictOperation: GitConflictOperation
): { action: GitSequencerAction; label: string } | null {
  if (conflictOperation === 'rebase') {
    return {
      action: 'rebase-continue',
      label: translate(
        'auto.components.right.sidebar.source.control.in_progress.continueRebase',
        'Continue Rebase'
      )
    }
  }
  if (conflictOperation === 'cherry-pick') {
    return {
      action: 'cherry-pick-continue',
      label: translate(
        'auto.components.right.sidebar.source.control.in_progress.continue',
        'Continue'
      )
    }
  }
  return null
}

function RebaseOverflowMenu({
  disabled,
  onSkip
}: {
  disabled: boolean
  onSkip: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-6 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          aria-label={translate(
            'auto.components.right.sidebar.source.control.in_progress.moreRebaseActions',
            'More rebase actions'
          )}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onSkip}>
          <SkipForward className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.source.control.in_progress.skipCommit',
            'Skip Commit'
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Why: separate from ConflictSummaryCard because a rebase/merge/cherry-pick can be in progress with no conflicts (between steps, or resolved but pre-continue).
export function OperationBanner({
  conflictOperation,
  isAbortingOperation = false,
  onAbortOperation,
  onSequencerAction
}: {
  conflictOperation: GitConflictOperation
  isAbortingOperation?: boolean
  onAbortOperation?: (operation: GitConflictOperation) => void
  onSequencerAction?: (action: GitSequencerAction) => void
}): React.JSX.Element {
  const Icon = conflictOperation === 'rebase' ? GitPullRequestArrow : GitMerge
  const abort = onAbortOperation ? abortLabel(conflictOperation) : null
  const next = onSequencerAction ? continueAction(conflictOperation) : null

  return (
    <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {operationLabel(conflictOperation)}
        </span>
        {conflictOperation === 'rebase' && onSequencerAction ? (
          <RebaseOverflowMenu
            disabled={isAbortingOperation}
            onSkip={() => onSequencerAction('rebase-skip')}
          />
        ) : null}
      </div>
      {conflictOperation === 'merge' ? (
        <div className="mt-1 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.source.control.in_progress.mergeHint',
            'Commit to finish the merge, or abort it.'
          )}
        </div>
      ) : null}
      {next || abort ? (
        <div className="mt-2 flex gap-1.5">
          {next ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-7 min-w-0 flex-1 text-xs"
              disabled={isAbortingOperation}
              onClick={() => onSequencerAction?.(next.action)}
            >
              {isAbortingOperation ? <RefreshCw className="size-3.5 animate-spin" /> : null}
              {next.label}
            </Button>
          ) : null}
          {abort ? (
            <Button
              type="button"
              // Why: abort is the escape hatch, so use the quiet outline action instead of reading as destructive.
              variant="outline"
              size="sm"
              className="h-7 min-w-0 flex-1 text-xs"
              disabled={isAbortingOperation}
              onClick={() => onAbortOperation?.(conflictOperation)}
            >
              {isAbortingOperation && !next ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : null}
              {abort}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
