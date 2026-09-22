// Tab, search and status filtering for the Extension Hub, kept out of the component so the rules
// are assertable without a DOM.

import type { ExtensionInventoryEntry } from '../../../../shared/extension-state-types'

export type ExtensionTab = 'skills' | 'tools'
export type ExtensionStatusFilter = 'all' | 'installed' | 'updates' | 'available'

export type ExtensionFilterState = {
  tab: ExtensionTab
  query: string
  status: ExtensionStatusFilter
}

export const DEFAULT_EXTENSION_FILTER: ExtensionFilterState = {
  tab: 'tools',
  query: '',
  status: 'all'
}

export function extensionTabFor(entry: ExtensionInventoryEntry): ExtensionTab {
  return entry.entry.kind === 'skill' ? 'skills' : 'tools'
}

function matchesQuery(entry: ExtensionInventoryEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return true
  }
  const haystack = [
    entry.entry.name,
    entry.entry.id,
    entry.entry.description,
    ...entry.entry.keywords
  ]
    .join(' ')
    .toLowerCase()
  return needle.split(/\s+/).every((term) => haystack.includes(term))
}

function matchesStatus(entry: ExtensionInventoryEntry, status: ExtensionStatusFilter): boolean {
  switch (status) {
    case 'all':
      return true
    case 'installed':
      return entry.state.installed
    case 'updates':
      return entry.state.status === 'outdated'
    case 'available':
      return !entry.state.installed
  }
}

export function filterExtensions(
  entries: readonly ExtensionInventoryEntry[],
  filter: ExtensionFilterState
): ExtensionInventoryEntry[] {
  return entries.filter(
    (entry) =>
      extensionTabFor(entry) === filter.tab &&
      matchesQuery(entry, filter.query) &&
      matchesStatus(entry, filter.status)
  )
}

/**
 * Tab counts ignore the status filter but honour the search, so switching tabs while searching
 * shows how many matches are waiting on the other side rather than a number that never moves.
 */
export function countExtensionsByTab(
  entries: readonly ExtensionInventoryEntry[],
  query: string
): Record<ExtensionTab, number> {
  const counts: Record<ExtensionTab, number> = { skills: 0, tools: 0 }
  for (const entry of entries) {
    if (matchesQuery(entry, query)) {
      counts[extensionTabFor(entry)] += 1
    }
  }
  return counts
}

/** Something to act on first: outdated, then not installed, then everything else, then by name. */
export function sortExtensionsByUrgency(
  entries: readonly ExtensionInventoryEntry[]
): ExtensionInventoryEntry[] {
  const rank = (entry: ExtensionInventoryEntry): number => {
    if (entry.state.status === 'outdated') {
      return 0
    }
    if (entry.state.status === 'unsupported-platform' || entry.state.status === 'no-access') {
      return 3
    }
    return entry.state.installed ? 2 : 1
  }
  return [...entries].sort(
    (left, right) =>
      rank(left) - rank(right) || left.entry.name.localeCompare(right.entry.name, 'en')
  )
}
