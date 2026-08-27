import { describe, expect, it } from 'vitest'
import { resolveWhatsNewTransition } from './whats-new'

describe('resolveWhatsNewTransition', () => {
  it('treats a missing record as a fresh install', () => {
    expect(resolveWhatsNewTransition(null, '1.5.53')).toEqual({ kind: 'install' })
    expect(resolveWhatsNewTransition(undefined, '1.5.53')).toEqual({ kind: 'install' })
    expect(resolveWhatsNewTransition('', '1.5.53')).toEqual({ kind: 'install' })
  })

  it('treats an identical version as nothing to show', () => {
    expect(resolveWhatsNewTransition('1.5.53', '1.5.53')).toEqual({ kind: 'same' })
  })

  it('treats a newer recorded version as a rollback', () => {
    expect(resolveWhatsNewTransition('1.5.54', '1.5.53')).toEqual({ kind: 'rollback' })
    expect(resolveWhatsNewTransition('2.0.0', '1.9.9')).toEqual({ kind: 'rollback' })
  })

  it('treats an older recorded version as an update', () => {
    expect(resolveWhatsNewTransition('1.5.52', '1.5.53')).toEqual({ kind: 'update' })
    expect(resolveWhatsNewTransition('1.5.9', '1.5.10')).toEqual({ kind: 'update' })
  })

  it('compares numerically, not lexicographically', () => {
    // "9" > "10" as strings — the update must still be detected.
    expect(resolveWhatsNewTransition('1.5.9', '1.5.10')).toEqual({ kind: 'update' })
  })

  it('treats unparseable stored versions as unknown provenance', () => {
    expect(resolveWhatsNewTransition('abc', '1.5.53')).toEqual({ kind: 'install' })
    expect(resolveWhatsNewTransition('1.x.3', '1.5.53')).toEqual({ kind: 'install' })
  })
})
