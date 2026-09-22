import { describe, expect, it } from 'vitest'
import {
  MAX_EXTENSION_DISMISSALS,
  mergeExtensionDismissals,
  readExtensionAutoUpdate,
  setExtensionAutoUpdateEntry,
  setExtensionAutoUpdateMaster
} from './extension-preferences'

describe('readExtensionAutoUpdate', () => {
  it('defaults to off with no entries', () => {
    expect(readExtensionAutoUpdate(null)).toEqual({ master: false, entries: {} })
  })

  it('returns what is stored', () => {
    const stored = { master: true, entries: { acme: false } }
    expect(readExtensionAutoUpdate({ extensionAutoUpdate: stored })).toEqual(stored)
  })
})

describe('setExtensionAutoUpdateMaster', () => {
  it('keeps per-entry choices, which the master switch is only a default for', () => {
    const result = setExtensionAutoUpdateMaster({ master: false, entries: { acme: false } }, true)
    expect(result).toEqual({ master: true, entries: { acme: false } })
  })
})

describe('setExtensionAutoUpdateEntry', () => {
  it('sets one entry without disturbing the others', () => {
    const result = setExtensionAutoUpdateEntry(
      { master: false, entries: { acme: true } },
      'other',
      true
    )
    expect(result.entries).toEqual({ acme: true, other: true })
  })

  it('overwrites an existing choice', () => {
    const result = setExtensionAutoUpdateEntry({ master: true, entries: { acme: true } }, 'acme', false)
    expect(result.entries.acme).toBe(false)
  })
})

describe('mergeExtensionDismissals', () => {
  it('puts new keys first', () => {
    expect(mergeExtensionDismissals(['old@1'], ['new@2'])).toEqual(['new@2', 'old@1'])
  })

  it('does not duplicate a key dismissed twice', () => {
    expect(mergeExtensionDismissals(['acme@1'], ['acme@1'])).toEqual(['acme@1'])
  })

  it('bounds the list, dropping the oldest rather than the newest', () => {
    const existing = Array.from({ length: MAX_EXTENSION_DISMISSALS }, (_, i) => `old-${i}@1`)
    const result = mergeExtensionDismissals(existing, ['new@2'])
    expect(result[0]).toBe('new@2')
    expect(result).toHaveLength(MAX_EXTENSION_DISMISSALS)
  })

  it('handles no stored dismissals', () => {
    expect(mergeExtensionDismissals(undefined, ['a@1'])).toEqual(['a@1'])
  })
})
