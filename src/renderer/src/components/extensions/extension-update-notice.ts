// Which extension updates are worth interrupting someone about.
//
// Three things disqualify an update: it is already being handled automatically, the user has
// dismissed this exact version, or there is no version to key a dismissal on. The last one matters
// more than it looks — without a version, "dismiss" would either silence the entry forever or nag
// on every launch, and both are worse than staying quiet.

import type {
  ExtensionInventory,
  ExtensionInventoryEntry
} from '../../../../shared/extension-state-types'

export function extensionDismissalKey(item: ExtensionInventoryEntry): string | null {
  return item.state.latestVersion ? `${item.entry.id}@${item.state.latestVersion}` : null
}

export function pendingExtensionUpdates(
  inventory: ExtensionInventory | null,
  dismissals: readonly string[]
): ExtensionInventoryEntry[] {
  const dismissed = new Set(dismissals)
  return (inventory?.entries ?? []).filter((item) => {
    if (item.state.status !== 'outdated' || item.state.autoUpdateEnabled) {
      return false
    }
    const key = extensionDismissalKey(item)
    return key !== null && !dismissed.has(key)
  })
}

/** "ActiveCollab MCP 1.4.2, Agent Local 0.9.1", capped so the card cannot grow without bound. */
export function summarizeExtensionUpdates(
  items: readonly ExtensionInventoryEntry[],
  limit = 3
): string {
  const named = items
    .slice(0, limit)
    .map((item) => `${item.entry.name} ${item.state.latestVersion}`)
  const remaining = items.length - named.length
  return remaining > 0 ? `${named.join(', ')} +${remaining}` : named.join(', ')
}
