import { describe, expect, it } from 'vitest'
import {
  importPathCovers,
  isSiteImportFileRuleArray,
  mergeImportFileRules,
  normalizeImportRulePath
} from './site-import-file-rules'

describe('normalizeImportRulePath', () => {
  it('cleans what a person types into a webroot-relative path', () => {
    expect(normalizeImportRulePath(' ./wp-content//ai1wm-backups/ ')).toBe(
      'wp-content/ai1wm-backups'
    )
    expect(normalizeImportRulePath('/backups')).toBe('backups')
    expect(normalizeImportRulePath('wp-content\\updraft')).toBe('wp-content/updraft')
  })

  it('refuses paths that are empty or climb out of the webroot', () => {
    expect(normalizeImportRulePath('  ')).toBeNull()
    expect(normalizeImportRulePath('../etc')).toBeNull()
    expect(normalizeImportRulePath('a/\nb')).toBeNull()
  })
})

describe('isSiteImportFileRuleArray', () => {
  it('accepts clean rules only', () => {
    expect(isSiteImportFileRuleArray([{ path: 'backups', action: 'skip' }])).toBe(true)
    expect(isSiteImportFileRuleArray([{ path: './backups', action: 'skip' }])).toBe(false)
    expect(isSiteImportFileRuleArray([{ path: 'backups', action: 'delete' }])).toBe(false)
  })
})

describe('rule helpers', () => {
  it('treats a folder rule as covering what is inside it, not its siblings', () => {
    expect(importPathCovers('wp-content/cache', 'wp-content/cache/a.html')).toBe(true)
    expect(importPathCovers('wp-content/cache', 'wp-content/cache-old')).toBe(false)
  })

  it('lets the latest choice for a path win', () => {
    expect(
      mergeImportFileRules(
        [{ path: 'backups', action: 'keep' }],
        [{ path: 'backups', action: 'skip' }]
      )
    ).toEqual([{ path: 'backups', action: 'skip' }])
  })
})
