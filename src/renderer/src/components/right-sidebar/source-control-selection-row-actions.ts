import type { GitStatusEntry } from '../../../../shared/types'
import type { FlatEntry } from './useSourceControlSelection'
import {
  getDiscardAllPaths,
  isStageableStatusEntry,
  type DiscardAllArea
} from './discard-all-sequence'
import { canDiscardStatusEntry, canUnstageStatusEntry } from './source-control-entry-actions'
import { resolveEntryContextMenuActions } from './source-control-entry-context-menu-actions'

export type SourceControlRowActionPlan =
  | { type: 'stage' | 'unstage'; paths: string[]; bulk: boolean }
  | { type: 'discard-entry'; entry: GitStatusEntry }
  | { type: 'discard-paths'; area: DiscardAllArea; paths: string[] }

// Why: a row acts for the whole multi-selection only when it is part of it,
// matching how right-clicking an unselected row replaces the selection.
function getSelectionScope(key: string, selectedEntries: readonly FlatEntry[]): FlatEntry[] | null {
  return selectedEntries.length > 1 && selectedEntries.some((selected) => selected.key === key)
    ? [...selectedEntries]
    : null
}

export function planSourceControlRowIndexAction(
  key: string,
  entry: GitStatusEntry,
  selectedEntries: readonly FlatEntry[]
): SourceControlRowActionPlan | null {
  const kind = resolveEntryContextMenuActions(entry).indexAction
  if (!kind) {
    return null
  }
  const scope = getSelectionScope(key, selectedEntries)
  if (!scope) {
    return { type: kind, paths: [entry.path], bulk: false }
  }
  const eligible = kind === 'stage' ? isStageableStatusEntry : canUnstageStatusEntry
  const paths = scope.filter((selected) => eligible(selected.entry)).map((s) => s.entry.path)
  return { type: kind, paths, bulk: true }
}

export function planSourceControlRowDiscardAction(
  key: string,
  entry: GitStatusEntry,
  selectedEntries: readonly FlatEntry[]
): SourceControlRowActionPlan | null {
  if (!canDiscardStatusEntry(entry)) {
    return null
  }
  const scope = getSelectionScope(key, selectedEntries)
  // Why: the confirmation dialog is per-area, so a mixed selection discards only
  // the rows sharing the invoked row's area.
  const area = entry.area as DiscardAllArea
  const sameArea = (scope ?? [])
    .map((selected) => selected.entry)
    .filter((selected) => selected.area === area && canDiscardStatusEntry(selected))
  if (sameArea.length <= 1) {
    return { type: 'discard-entry', entry }
  }
  return { type: 'discard-paths', area, paths: getDiscardAllPaths(sameArea, area) }
}

export type SourceControlRowActionHandlers = {
  stage: (path: string) => Promise<void>
  unstage: (path: string) => Promise<void>
  stagePaths: (paths: readonly string[]) => Promise<void>
  unstagePaths: (paths: readonly string[]) => Promise<void>
  discardEntry: (entry: GitStatusEntry) => void
  discardPaths: (area: DiscardAllArea, paths: readonly string[]) => void
}

export function runSourceControlRowActionPlan(
  plan: SourceControlRowActionPlan | null,
  handlers: SourceControlRowActionHandlers
): void {
  if (!plan) {
    return
  }
  switch (plan.type) {
    case 'stage':
      void (plan.bulk ? handlers.stagePaths(plan.paths) : handlers.stage(plan.paths[0]))
      return
    case 'unstage':
      void (plan.bulk ? handlers.unstagePaths(plan.paths) : handlers.unstage(plan.paths[0]))
      return
    case 'discard-entry':
      handlers.discardEntry(plan.entry)
      return
    case 'discard-paths':
      handlers.discardPaths(plan.area, plan.paths)
  }
}

export type SourceControlSelectionRowActions = {
  index: (key: string, entry: GitStatusEntry) => void
  discard: (key: string, entry: GitStatusEntry) => void
}

export function createSourceControlSelectionRowActions(
  selectedEntries: readonly FlatEntry[],
  handlers: SourceControlRowActionHandlers
): SourceControlSelectionRowActions {
  return {
    index: (key, entry) =>
      runSourceControlRowActionPlan(
        planSourceControlRowIndexAction(key, entry, selectedEntries),
        handlers
      ),
    discard: (key, entry) =>
      runSourceControlRowActionPlan(
        planSourceControlRowDiscardAction(key, entry, selectedEntries),
        handlers
      )
  }
}
