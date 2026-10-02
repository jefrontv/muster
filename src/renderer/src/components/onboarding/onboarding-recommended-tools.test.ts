import { describe, expect, it } from 'vitest'
import type { ExtensionInventory } from '../../../../shared/extension-state-types'
import { recommendedExtensions } from './onboarding-recommended-tools'

function inventory(entries: { id: string; status: string }[]): ExtensionInventory {
  return {
    entries: entries.map(({ id, status }) => ({
      entry: { id, name: id },
      state: { id, status, installed: status === 'current' }
    }))
  } as unknown as ExtensionInventory
}

describe('recommendedExtensions', () => {
  it('keeps the recommended entries this machine can install, in recommendation order', () => {
    const items = recommendedExtensions(
      inventory([
        { id: 'context7-mcp', status: 'not-installed' },
        { id: 'activecollab-mcp', status: 'not-installed' },
        { id: 'agent-local', status: 'unsupported-platform' },
        { id: 'efront-memory', status: 'current' },
        { id: 'acf-json-mcp', status: 'no-access' }
      ])
    )
    expect(items.map(({ entry }) => entry.id)).toEqual(['efront-memory', 'context7-mcp'])
  })

  it('is empty before the inventory loads', () => {
    expect(recommendedExtensions(null)).toEqual([])
  })
})
