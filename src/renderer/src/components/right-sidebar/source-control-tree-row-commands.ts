import type { GitBranchChangeEntry, GitStatusEntry } from '../../../../shared/types'
import type { SourceControlTreeRow } from './source-control-tree-rows'
import type { SourceControlSelectionRowActions } from './source-control-selection-row-actions'

export type SourceControlTreeRowAction = 'stage' | 'unstage' | 'discard' | 'view-all'

export const SOURCE_CONTROL_ROW_ACTION_ATTRIBUTE = 'data-source-control-row-action'

/**
 * Clicks a header/folder's own bulk button so keyboard input inherits its exact
 * eligibility, filter and confirmation rules. Returns false when it is absent.
 */
export function clickSourceControlTreeRowAction(
  element: HTMLElement,
  action: SourceControlTreeRowAction
): boolean {
  const button = element.querySelector<HTMLElement>(
    `[${SOURCE_CONTROL_ROW_ACTION_ATTRIBUTE}="${action}"]`
  )
  if (!button) {
    return false
  }
  button.click()
  return true
}

export type SourceControlTreeRowCommandDeps = {
  toggleSection: (sectionId: string) => void
  toggleTreeDir: (key: string) => void
  toggleSubmodule: (entry: GitStatusEntry) => void
  openDiff: (entry: GitStatusEntry) => void
  openCommittedDiff: (entry: GitBranchChangeEntry) => void
  rowActions: SourceControlSelectionRowActions
}

export type SourceControlTreeRowCommands = {
  open: (row: SourceControlTreeRow, element: HTMLElement) => void
  setExpanded: (row: SourceControlTreeRow, expanded: boolean) => void
  toggleIndex: (row: SourceControlTreeRow, element: HTMLElement) => void
  discard: (row: SourceControlTreeRow, element: HTMLElement) => void
}

export function createSourceControlTreeRowCommands(
  deps: SourceControlTreeRowCommandDeps
): SourceControlTreeRowCommands {
  const toggle = (row: SourceControlTreeRow): void => {
    if (row.kind === 'section') {
      deps.toggleSection(row.sectionId)
    } else if (row.kind === 'directory') {
      deps.toggleTreeDir(row.id)
    } else if (row.kind === 'file' && row.expanded !== undefined) {
      deps.toggleSubmodule(row.entry)
    }
  }
  return {
    open: (row, element) => {
      if (row.kind === 'branch-file') {
        deps.openCommittedDiff(row.entry)
      } else if (row.kind === 'file' && row.expanded === undefined) {
        deps.openDiff(row.entry)
      } else if (row.kind !== 'section' || !clickSourceControlTreeRowAction(element, 'view-all')) {
        toggle(row)
      }
    },
    setExpanded: (row, expanded) => {
      if (row.expanded !== undefined && row.expanded !== expanded) {
        toggle(row)
      }
    },
    toggleIndex: (row, element) => {
      if (row.kind === 'file') {
        deps.rowActions.index(row.id, row.entry)
      } else if (row.kind === 'section' || row.kind === 'directory') {
        // Why: a section/folder offers one direction (stage for unstaged rows, unstage for staged).
        if (!clickSourceControlTreeRowAction(element, 'stage')) {
          clickSourceControlTreeRowAction(element, 'unstage')
        }
      }
    },
    discard: (row, element) => {
      if (row.kind === 'file') {
        deps.rowActions.discard(row.id, row.entry)
      } else if (row.kind === 'section' || row.kind === 'directory') {
        clickSourceControlTreeRowAction(element, 'discard')
      }
    }
  }
}
