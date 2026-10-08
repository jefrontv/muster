import type { GitStatusEntry } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import {
  canDiscardStatusEntry,
  canStageStatusEntry,
  canUnstageStatusEntry
} from './source-control-entry-actions'

export type EntryContextMenuIndexAction = 'stage' | 'unstage'
export type EntryContextMenuDiscardAction = 'discard' | 'restore' | 'delete'

export type EntryContextMenuActions = {
  indexAction: EntryContextMenuIndexAction | null
  discardAction: EntryContextMenuDiscardAction | null
  canOpenFile: boolean
}

// Why: reuse the hover-button eligibility so the menu never offers an action the row would refuse.
export function resolveEntryContextMenuActions(entry: GitStatusEntry): EntryContextMenuActions {
  const indexAction = canStageStatusEntry(entry)
    ? 'stage'
    : canUnstageStatusEntry(entry)
      ? 'unstage'
      : null
  const discardAction = !canDiscardStatusEntry(entry)
    ? null
    : entry.area === 'untracked'
      ? 'delete'
      : entry.status === 'deleted'
        ? 'restore'
        : 'discard'
  return { indexAction, discardAction, canOpenFile: entry.status !== 'deleted' }
}

export function getEntryContextMenuIndexLabel(action: EntryContextMenuIndexAction): string {
  return action === 'stage'
    ? translate(
        'auto.components.right.sidebar.SourceControlEntryContextMenu.stageChanges',
        'Stage Changes'
      )
    : translate(
        'auto.components.right.sidebar.SourceControlEntryContextMenu.unstageChanges',
        'Unstage Changes'
      )
}

export function getEntryContextMenuDiscardLabel(action: EntryContextMenuDiscardAction): string {
  switch (action) {
    case 'delete':
      return translate(
        'auto.components.right.sidebar.SourceControlEntryContextMenu.deleteFile',
        'Delete File'
      )
    case 'restore':
      return translate(
        'auto.components.right.sidebar.SourceControlEntryContextMenu.restoreFile',
        'Restore File'
      )
    case 'discard':
      return translate(
        'auto.components.right.sidebar.SourceControlEntryContextMenu.discardChanges',
        'Discard Changes'
      )
  }
}
