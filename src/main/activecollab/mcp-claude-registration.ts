// Registers the ActiveCollab MCP server with Claude Code after a sign-in, through the Extension Hub
// so the entry is the one Settings and onboarding compare against.

import type { Store } from '../persistence'
import {
  findCatalogEntry,
  installExtensionHarness,
  readExtensionInventory
} from '../extensions/extension-service'

const ACTIVECOLLAB_EXTENSION_ID = 'activecollab-mcp'

/** Skips quietly when Claude Code is not on this machine or already has a current entry. */
export async function registerActiveCollabMcpWithClaude(store: Store): Promise<void> {
  const inventory = await readExtensionInventory(store)
  const item = inventory.entries.find(({ entry }) => entry.id === ACTIVECOLLAB_EXTENSION_ID)
  const claude = item?.state.harnesses.find((harness) => harness.id === 'claude-code')
  const entry = findCatalogEntry(inventory, ACTIVECOLLAB_EXTENSION_ID)
  if (!entry || !claude?.present || (claude.configured && claude.current)) {
    return
  }
  installExtensionHarness(store, entry, 'claude-code')
}
