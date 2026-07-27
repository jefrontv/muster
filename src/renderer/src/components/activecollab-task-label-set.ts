// Label-set arithmetic for ActiveCollab task writes.
//
// `ActiveCollabTaskUpdate.labelNames` REPLACES the task's whole label set — the API overwrites
// rather than merges. Sending only the label the user just clicked silently deletes every other
// label on the task, so every toggle here returns the full merged list.

import type { ActiveCollabLabel } from '../../../shared/activecollab-types'

/** Case-insensitive: ActiveCollab treats "Blocked" and "blocked" as the same label. */
function sameLabel(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

export function activeCollabLabelNames(labels: ActiveCollabLabel[]): string[] {
  const names: string[] = []
  for (const label of labels) {
    const name = label.name.trim()
    if (name && !names.some((existing) => sameLabel(existing, name))) {
      names.push(name)
    }
  }
  return names
}

export function hasActiveCollabLabel(labels: ActiveCollabLabel[], name: string): boolean {
  return labels.some((label) => sameLabel(label.name, name))
}

/**
 * The full replacement set after toggling one label: the current set with `name` appended when it
 * was absent, or removed when it was present. Never the addition on its own.
 */
export function toggleActiveCollabLabelName(labels: ActiveCollabLabel[], name: string): string[] {
  const trimmed = name.trim()
  const current = activeCollabLabelNames(labels)
  if (!trimmed) {
    return current
  }
  const without = current.filter((existing) => !sameLabel(existing, trimmed))
  return without.length === current.length ? [...current, trimmed] : without
}
