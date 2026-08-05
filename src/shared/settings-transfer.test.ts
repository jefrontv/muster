import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from './constants'
import {
  SETTINGS_EXPORT_KIND,
  SETTINGS_EXPORT_VERSION,
  buildSettingsExport,
  exportableSettingsKeys,
  parseSettingsImport
} from './settings-transfer'

const HOME = '/home/tester'

function exportOf(overrides: Record<string, unknown> = {}) {
  return buildSettingsExport({
    settings: { ...getDefaultSettings(HOME), ...overrides } as never,
    homedir: HOME,
    appVersion: '1.2.3',
    now: new Date('2026-08-03T00:00:00.000Z')
  })
}

describe('buildSettingsExport', () => {
  it('omits the safeStorage-encrypted secrets entirely, not as blanks', () => {
    const file = exportOf({
      opencodeSessionCookie: 'sk-live-secret-cookie',
      httpProxyUrl: 'http://user:hunter2@proxy.internal:8080'
    })

    expect(file.settings).not.toHaveProperty('opencodeSessionCookie')
    expect(file.settings).not.toHaveProperty('httpProxyUrl')
    expect(JSON.stringify(file)).not.toContain('hunter2')
    expect(JSON.stringify(file)).not.toContain('sk-live-secret-cookie')
  })

  it('omits machine-local paths and per-host account inventories', () => {
    const file = exportOf({
      workspaceDir: '/Users/tester/Muster',
      claudeManagedAccounts: [{ id: 'a', email: 'tester@example.com' }]
    })

    expect(file.settings).not.toHaveProperty('workspaceDir')
    expect(file.settings).not.toHaveProperty('claudeManagedAccounts')
    expect(JSON.stringify(file)).not.toContain('tester@example.com')
  })

  it('carries the ordinary preferences it is meant to move', () => {
    const file = exportOf({ theme: 'dark', terminalFontSize: 18 })

    expect(file.kind).toBe(SETTINGS_EXPORT_KIND)
    expect(file.version).toBe(SETTINGS_EXPORT_VERSION)
    expect(file.exportedAt).toBe('2026-08-03T00:00:00.000Z')
    expect(file.settings.theme).toBe('dark')
    expect(file.settings.terminalFontSize).toBe(18)
  })

  it('round-trips its own output', () => {
    const file = exportOf({ theme: 'light', terminalFontSize: 15 })
    const result = parseSettingsImport(JSON.stringify(file), HOME)

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.ignoredKeys).toEqual([])
      expect(result.settings.theme).toBe('light')
      expect(result.settings.terminalFontSize).toBe(15)
    }
  })
})

describe('exportableSettingsKeys', () => {
  it('never lists a secret or machine-local key', () => {
    const keys = exportableSettingsKeys(HOME)

    expect(keys).not.toContain('opencodeSessionCookie')
    expect(keys).not.toContain('httpProxyUrl')
    expect(keys).not.toContain('workspaceDir')
    expect(keys).toContain('theme')
  })
})

describe('parseSettingsImport', () => {
  it('rejects a file that is not JSON', () => {
    expect(parseSettingsImport('not json at all', HOME)).toEqual({ ok: false, reason: 'notJson' })
  })

  it('rejects a JSON document that is not a settings export', () => {
    expect(parseSettingsImport('{"hello":"world"}', HOME)).toEqual({
      ok: false,
      reason: 'notASettingsExport'
    })
  })

  it('rejects a future export format instead of guessing at it', () => {
    const file = { ...exportOf(), version: 99 }
    expect(parseSettingsImport(JSON.stringify(file), HOME)).toEqual({
      ok: false,
      reason: 'unsupportedVersion'
    })
  })

  it('rejects a payload whose settings field is the wrong shape', () => {
    const file = { ...exportOf(), settings: [1, 2, 3] }
    expect(parseSettingsImport(JSON.stringify(file), HOME)).toEqual({
      ok: false,
      reason: 'missingSettings'
    })
  })

  it('rejects a file carrying a secret rather than importing it', () => {
    const file = exportOf()
    const tampered = {
      ...file,
      settings: { ...file.settings, opencodeSessionCookie: 'sk-live-stolen' }
    }

    expect(parseSettingsImport(JSON.stringify(tampered), HOME)).toEqual({
      ok: false,
      reason: 'containsExcludedKey'
    })
  })

  it('rejects a known key holding the wrong kind of value', () => {
    const file = exportOf()
    const tampered = { ...file, settings: { ...file.settings, terminalFontSize: 'enormous' } }

    expect(parseSettingsImport(JSON.stringify(tampered), HOME)).toEqual({
      ok: false,
      reason: 'invalidValue'
    })
  })

  it('reports unknown keys instead of merging them', () => {
    const file = exportOf({ theme: 'dark' })
    const tampered = { ...file, settings: { ...file.settings, somethingFromTheFuture: true } }
    const result = parseSettingsImport(JSON.stringify(tampered), HOME)

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.ignoredKeys).toEqual(['somethingFromTheFuture'])
      expect(result.settings).not.toHaveProperty('somethingFromTheFuture')
    }
  })

  it('rejects a file with nothing this build recognises', () => {
    const file = { ...exportOf(), settings: { somethingFromTheFuture: true } }
    expect(parseSettingsImport(JSON.stringify(file), HOME)).toEqual({
      ok: false,
      reason: 'noRecognizedSettings'
    })
  })

  it('accepts null for a setting whose default is a concrete value', () => {
    const file = exportOf()
    const tampered = { ...file, settings: { ...file.settings, defaultRepoSelection: ['repo-1'] } }
    const result = parseSettingsImport(JSON.stringify(tampered), HOME)

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.settings.defaultRepoSelection).toEqual(['repo-1'])
    }
  })
})
