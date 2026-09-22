import { describe, expect, it } from 'vitest'
import type {
  ExtensionInventory,
  ExtensionInventoryEntry
} from '../../../../shared/extension-state-types'
import {
  extensionDismissalKey,
  pendingExtensionUpdates,
  summarizeExtensionUpdates
} from './extension-update-notice'

function item(
  id: string,
  overrides: {
    status?: ExtensionInventoryEntry['state']['status']
    latestVersion?: string | null
    autoUpdateEnabled?: boolean
  } = {}
): ExtensionInventoryEntry {
  return {
    entry: {
      id,
      kind: 'mcp',
      name: id,
      description: '',
      keywords: [],
      version: '1.0.0',
      install: { method: 'bundled-skill', skill: 'inert' },
      latest: { source: 'bundled' }
    },
    state: {
      id,
      installed: true,
      installedVersion: '1.0.0',
      latestVersion: overrides.latestVersion === undefined ? '2.0.0' : overrides.latestVersion,
      status: overrides.status ?? 'outdated',
      binaryPath: null,
      harnesses: [],
      autoUpdateSupported: true,
      autoUpdateEnabled: overrides.autoUpdateEnabled ?? false
    }
  }
}

function inventoryOf(...entries: ExtensionInventoryEntry[]): ExtensionInventory {
  return {
    schemaVersion: 1,
    entries,
    catalogOrigin: 'bundled',
    catalogUpdatedAt: '2026-09-22',
    scannedAt: 0
  }
}

describe('pendingExtensionUpdates', () => {
  it('lists an outdated entry nobody has dismissed', () => {
    expect(pendingExtensionUpdates(inventoryOf(item('acme')), [])).toHaveLength(1)
  })

  it('ignores an entry that is up to date', () => {
    expect(pendingExtensionUpdates(inventoryOf(item('acme', { status: 'current' })), [])).toEqual([])
  })

  it('stays quiet about an entry that updates itself', () => {
    expect(
      pendingExtensionUpdates(inventoryOf(item('acme', { autoUpdateEnabled: true })), [])
    ).toEqual([])
  })

  it('honours a dismissal of this exact version', () => {
    expect(pendingExtensionUpdates(inventoryOf(item('acme')), ['acme@2.0.0'])).toEqual([])
  })

  it('asks again once a newer version lands', () => {
    expect(
      pendingExtensionUpdates(inventoryOf(item('acme', { latestVersion: '3.0.0' })), ['acme@2.0.0'])
    ).toHaveLength(1)
  })

  it('stays quiet when there is no version to key a dismissal on', () => {
    expect(pendingExtensionUpdates(inventoryOf(item('acme', { latestVersion: null })), [])).toEqual(
      []
    )
  })

  it('handles a missing inventory', () => {
    expect(pendingExtensionUpdates(null, [])).toEqual([])
  })
})

describe('extensionDismissalKey', () => {
  it('keys on id and version together', () => {
    expect(extensionDismissalKey(item('acme'))).toBe('acme@2.0.0')
  })

  it('refuses a key it could not make honest', () => {
    expect(extensionDismissalKey(item('acme', { latestVersion: null }))).toBeNull()
  })
})

describe('summarizeExtensionUpdates', () => {
  it('names each update', () => {
    expect(summarizeExtensionUpdates([item('acme'), item('other')])).toBe('acme 2.0.0, other 2.0.0')
  })

  it('caps the list rather than growing the card', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id))
    expect(summarizeExtensionUpdates(many)).toBe('a 2.0.0, b 2.0.0, c 2.0.0 +2')
  })
})
