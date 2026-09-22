import { describe, expect, it } from 'vitest'
import {
  isExtensionPlatformSupported,
  parseExtensionCatalog,
  supportsExtensionAutoUpdate,
  type ExtensionEntry
} from './extension-catalog-types'

function catalog(entries: unknown[]): unknown {
  return { schemaVersion: 1, updatedAt: '2026-09-22', entries }
}

const configWriteEntry = {
  id: 'acme-mcp',
  kind: 'mcp',
  name: 'Acme MCP',
  description: 'Does Acme things.',
  keywords: ['acme'],
  version: '1.0.0',
  install: {
    method: 'config-write',
    server: {
      key: 'acme',
      harnesses: [
        {
          id: 'claude-code',
          transport: { kind: 'stdio', binary: 'acme-mcp', args: ['--stdio'], env: {} }
        }
      ]
    }
  },
  latest: { source: 'pinned' }
}

describe('parseExtensionCatalog', () => {
  it('accepts a well-formed catalog', () => {
    const parsed = parseExtensionCatalog(catalog([configWriteEntry]))
    expect(parsed?.entries).toHaveLength(1)
    expect(parsed?.entries[0].id).toBe('acme-mcp')
  })

  it('rejects an unknown install method rather than passing it through', () => {
    const parsed = parseExtensionCatalog(
      catalog([{ ...configWriteEntry, install: { method: 'run-anything', command: 'rm -rf /' } }])
    )
    expect(parsed).toBeNull()
  })

  it('rejects a command spec that names neither an install nor an update command', () => {
    const parsed = parseExtensionCatalog(
      catalog([
        { ...configWriteEntry, install: { method: 'command', command: { binary: 'acme' } } }
      ])
    )
    expect(parsed).toBeNull()
  })

  it('rejects duplicate entry ids', () => {
    expect(parseExtensionCatalog(catalog([configWriteEntry, configWriteEntry]))).toBeNull()
  })

  it('rejects two rows for the same harness, which would race each other', () => {
    const harness = configWriteEntry.install.server.harnesses[0]
    const parsed = parseExtensionCatalog(
      catalog([
        {
          ...configWriteEntry,
          install: {
            method: 'config-write',
            server: { key: 'acme', harnesses: [harness, harness] }
          }
        }
      ])
    )
    expect(parsed).toBeNull()
  })

  it('rejects a future schema version instead of guessing at it', () => {
    expect(parseExtensionCatalog({ ...(catalog([]) as object), schemaVersion: 2 })).toBeNull()
  })

  it('rejects a non-kebab id, which would reach cache keys and settings keys', () => {
    expect(parseExtensionCatalog(catalog([{ ...configWriteEntry, id: '../escape' }]))).toBeNull()
  })
})

describe('isExtensionPlatformSupported', () => {
  const entry = { platforms: ['darwin'] } as ExtensionEntry

  it('gates a platform-specific entry', () => {
    expect(isExtensionPlatformSupported(entry, 'darwin')).toBe(true)
    expect(isExtensionPlatformSupported(entry, 'win32')).toBe(false)
  })

  it('treats an absent platform list as every platform', () => {
    expect(isExtensionPlatformSupported({} as ExtensionEntry, 'linux')).toBe(true)
  })
})

describe('supportsExtensionAutoUpdate', () => {
  it('refuses a config-write entry that was never explicitly cleared', () => {
    expect(
      supportsExtensionAutoUpdate(parseExtensionCatalog(catalog([configWriteEntry]))!.entries[0])
    ).toBe(false)
  })

  it('allows an entry the catalog explicitly cleared', () => {
    const parsed = parseExtensionCatalog(
      catalog([{ ...configWriteEntry, autoUpdate: { supported: true } }])
    )
    expect(supportsExtensionAutoUpdate(parsed!.entries[0])).toBe(true)
  })

  it('refuses a command entry that has not been explicitly cleared', () => {
    const parsed = parseExtensionCatalog(
      catalog([
        {
          ...configWriteEntry,
          install: { method: 'command', command: { install: 'npm i -g acme' } }
        }
      ])
    )
    expect(supportsExtensionAutoUpdate(parsed!.entries[0])).toBe(false)
  })

  it('honours an explicit refusal on a config-write entry', () => {
    const parsed = parseExtensionCatalog(
      catalog([{ ...configWriteEntry, autoUpdate: { supported: false, reason: 'no' } }])
    )
    expect(supportsExtensionAutoUpdate(parsed!.entries[0])).toBe(false)
  })

  it('never offers auto-update for a bundled skill the app updater already owns', () => {
    const parsed = parseExtensionCatalog(
      catalog([
        {
          ...configWriteEntry,
          kind: 'skill',
          install: { method: 'bundled-skill', skill: 'acme' },
          autoUpdate: { supported: true }
        }
      ])
    )
    expect(supportsExtensionAutoUpdate(parsed!.entries[0])).toBe(false)
  })
})
