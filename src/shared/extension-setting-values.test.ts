import { describe, expect, it } from 'vitest'
import {
  applyExtensionSettingValues,
  declaredSettingValues,
  extensionSettingSpecs,
  readExtensionSettingValues,
  setExtensionSettingValues
} from './extension-setting-values'
import type { ExtensionEntry, ExtensionMcpServerSpec } from './extension-catalog-types'

const ENTRY: ExtensionEntry = {
  id: 'context7-mcp',
  kind: 'mcp',
  name: 'Context7',
  description: 'test',
  keywords: [],
  version: '4.1.1',
  install: {
    method: 'config-write',
    server: {
      key: 'context7',
      harnesses: [
        { id: 'claude-code', transport: { kind: 'stdio', binary: 'c7', args: [], env: {} } }
      ]
    }
  },
  latest: { source: 'pinned' },
  settings: [{ key: 'CONTEXT7_API_KEY', label: 'API key', secret: true }]
}

const SERVER: ExtensionMcpServerSpec = {
  key: 'context7',
  harnesses: [
    { id: 'claude-code', transport: { kind: 'stdio', binary: 'c7', args: [], env: { TZ: 'UTC' } } },
    { id: 'cursor', transport: { kind: 'http', url: 'https://example.test/mcp' } }
  ]
}

describe('readExtensionSettingValues', () => {
  it('answers an empty map rather than undefined', () => {
    expect(readExtensionSettingValues(null, 'context7-mcp')).toEqual({})
  })

  it('reads the values for one extension only', () => {
    const settings = {
      extensionSettingValues: { 'context7-mcp': { CONTEXT7_API_KEY: 'k' }, other: { X: 'y' } }
    }
    expect(readExtensionSettingValues(settings, 'context7-mcp')).toEqual({ CONTEXT7_API_KEY: 'k' })
  })
})

describe('declaredSettingValues', () => {
  it('keeps a declared key', () => {
    expect(declaredSettingValues(ENTRY, { CONTEXT7_API_KEY: 'abc' })).toEqual({
      CONTEXT7_API_KEY: 'abc'
    })
  })

  it('drops a key the catalog no longer asks for', () => {
    expect(declaredSettingValues(ENTRY, { OLD_KEY: 'abc' })).toEqual({})
  })

  it('drops a blank so clearing the field actually clears it', () => {
    expect(declaredSettingValues(ENTRY, { CONTEXT7_API_KEY: '   ' })).toEqual({})
  })

  it('trims, because a pasted key carries a newline more often than not', () => {
    expect(declaredSettingValues(ENTRY, { CONTEXT7_API_KEY: ' abc\n' })).toEqual({
      CONTEXT7_API_KEY: 'abc'
    })
  })
})

describe('applyExtensionSettingValues', () => {
  it('returns the same spec when there is nothing to apply', () => {
    expect(applyExtensionSettingValues(SERVER, {})).toBe(SERVER)
  })

  it('adds the value to a stdio env without losing what the catalog set', () => {
    const applied = applyExtensionSettingValues(SERVER, { CONTEXT7_API_KEY: 'abc' })
    const stdio = applied.harnesses[0].transport
    expect(stdio.kind === 'stdio' && stdio.env).toEqual({ TZ: 'UTC', CONTEXT7_API_KEY: 'abc' })
  })

  it('leaves an http transport alone, since it carries no environment', () => {
    const applied = applyExtensionSettingValues(SERVER, { CONTEXT7_API_KEY: 'abc' })
    expect(applied.harnesses[1].transport).toEqual(SERVER.harnesses[1].transport)
  })

  it('does not mutate the catalog spec it was given', () => {
    applyExtensionSettingValues(SERVER, { CONTEXT7_API_KEY: 'abc' })
    const stdio = SERVER.harnesses[0].transport
    expect(stdio.kind === 'stdio' && stdio.env).toEqual({ TZ: 'UTC' })
  })
})

describe('setExtensionSettingValues', () => {
  it('stores a value under the extension id', () => {
    expect(setExtensionSettingValues(undefined, 'context7-mcp', { A: 'b' })).toEqual({
      'context7-mcp': { A: 'b' }
    })
  })

  it('removes the entry entirely when every field is cleared', () => {
    const existing = { 'context7-mcp': { A: 'b' }, other: { X: 'y' } }
    expect(setExtensionSettingValues(existing, 'context7-mcp', { A: '' })).toEqual({
      other: { X: 'y' }
    })
  })

  it('leaves other extensions untouched', () => {
    const existing = { other: { X: 'y' } }
    expect(setExtensionSettingValues(existing, 'context7-mcp', { A: 'b' })).toEqual({
      other: { X: 'y' },
      'context7-mcp': { A: 'b' }
    })
  })
})

it('reports no specs for an entry that asks for nothing', () => {
  expect(extensionSettingSpecs({ ...ENTRY, settings: undefined })).toBeNull()
  expect(extensionSettingSpecs(ENTRY)).toHaveLength(1)
})
