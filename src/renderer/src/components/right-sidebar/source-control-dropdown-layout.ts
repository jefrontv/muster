import type { PrimaryActionKind } from './source-control-primary-action-types'
import type {
  DropdownEntry,
  DropdownItem,
  DropdownSeparator,
  DropdownSubmenuId
} from './source-control-dropdown-items'

export type DropdownLayoutRows = {
  commitRows: DropdownItem[]
  remoteRows: DropdownItem[]
  moreRows: DropdownItem[]
  reviewRows: DropdownItem[]
  publishRow: DropdownItem | null
  destructiveRows: DropdownItem[]
  abortRows: DropdownItem[]
}

const SEPARATOR: DropdownSeparator = { kind: 'separator' }

/** Commit, remote (+ More submenu), review, destructive, then abort rows when an operation is in progress. */
export function arrangeDropdownEntries(rows: DropdownLayoutRows): DropdownEntry[] {
  const groups: DropdownItem[][] = [
    rows.commitRows,
    [...rows.remoteRows, ...rows.moreRows.map((row) => ({ ...row, submenu: 'more' as const }))],
    rows.publishRow ? [...rows.reviewRows, rows.publishRow] : rows.reviewRows,
    rows.destructiveRows,
    rows.abortRows
  ]
  return joinGroups(groups)
}

function joinGroups(groups: DropdownItem[][]): DropdownEntry[] {
  const entries: DropdownEntry[] = []
  for (const group of groups) {
    if (group.length === 0) {
      continue
    }
    if (entries.length > 0) {
      entries.push(SEPARATOR)
    }
    entries.push(...group)
  }
  return entries
}

// Why: the primary button already offers Commit, so a second Commit row is noise.
export function omitPrimaryDuplicateRows(
  entries: DropdownEntry[],
  primaryKind: PrimaryActionKind
): DropdownEntry[] {
  if (primaryKind !== 'commit') {
    return entries
  }
  return collapseSeparators(entries.filter((entry) => entry.kind !== 'commit'))
}

function collapseSeparators(entries: DropdownEntry[]): DropdownEntry[] {
  const result: DropdownEntry[] = []
  for (const entry of entries) {
    const previous = result.at(-1)
    if (entry.kind === 'separator' && (!previous || previous.kind === 'separator')) {
      continue
    }
    result.push(entry)
  }
  while (result.at(-1)?.kind === 'separator') {
    result.pop()
  }
  return result
}

export type DropdownMenuSubmenuNode = {
  kind: 'submenu'
  id: DropdownSubmenuId
  items: DropdownItem[]
}

export type DropdownMenuNode = DropdownItem | DropdownSeparator | DropdownMenuSubmenuNode

/** Fold consecutive rows tagged with the same submenu into one nested node for rendering. */
export function toDropdownMenuNodes(entries: DropdownEntry[]): DropdownMenuNode[] {
  const nodes: DropdownMenuNode[] = []
  for (const entry of entries) {
    if (entry.kind === 'separator' || !entry.submenu) {
      nodes.push(entry)
      continue
    }
    const previous = nodes.at(-1)
    if (previous?.kind === 'submenu' && previous.id === entry.submenu) {
      previous.items.push(entry)
      continue
    }
    nodes.push({ kind: 'submenu', id: entry.submenu, items: [entry] })
  }
  return nodes
}
