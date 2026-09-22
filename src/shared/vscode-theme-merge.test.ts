import { describe, expect, it } from 'vitest'
import {
  mergeVscodeThemeDocuments,
  themeIncludePath,
  unsupportedThemeFeatures
} from './vscode-theme-merge'

describe('mergeVscodeThemeDocuments', () => {
  it('lets the including file win on a colour both set', () => {
    const merged = mergeVscodeThemeDocuments(
      { colors: { 'editor.background': '#1e1e1e', 'editor.foreground': '#d4d4d4' } },
      { colors: { 'editor.background': '#000000' } }
    )
    expect(merged.colors).toEqual({ 'editor.background': '#000000', 'editor.foreground': '#d4d4d4' })
  })

  it('appends the including file token colours after the included ones', () => {
    // Order is the contract: styleForScope breaks specificity ties by taking the last entry.
    const merged = mergeVscodeThemeDocuments(
      { tokenColors: [{ scope: 'comment', settings: { foreground: '#111111' } }] },
      { tokenColors: [{ scope: 'comment', settings: { foreground: '#222222' } }] }
    )
    expect(merged.tokenColors).toEqual([
      { scope: 'comment', settings: { foreground: '#111111' } },
      { scope: 'comment', settings: { foreground: '#222222' } }
    ])
  })

  it('reproduces the real split where colours and syntax live at different levels', () => {
    // dark_modern.json has colours and no tokenColors; dark_plus.json the reverse.
    const merged = mergeVscodeThemeDocuments(
      { type: 'dark', tokenColors: [{ scope: 'comment', settings: { foreground: '#6a9955' } }] },
      { name: 'Dark Modern', colors: { 'editor.background': '#1f1f1f' } }
    )
    expect(merged).toMatchObject({
      name: 'Dark Modern',
      type: 'dark',
      colors: { 'editor.background': '#1f1f1f' },
      tokenColors: [{ scope: 'comment', settings: { foreground: '#6a9955' } }]
    })
  })

  it('takes the name from the including file', () => {
    const merged = mergeVscodeThemeDocuments({ name: 'Dark+' }, { name: 'Dark Modern' })
    expect(merged.name).toBe('Dark Modern')
  })

  it('falls back to the included name when the including file states none', () => {
    const merged = mergeVscodeThemeDocuments({ name: 'Dark+' }, {})
    expect(merged.name).toBe('Dark+')
  })

  it('falls back to the included type, which mid-chain files often omit', () => {
    expect(mergeVscodeThemeDocuments({ type: 'dark' }, {}).type).toBe('dark')
  })

  it('drops include so the chain cannot be walked twice', () => {
    const merged = mergeVscodeThemeDocuments({}, { include: './other.json' })
    expect(merged.include).toBeUndefined()
  })

  it('merges semantic token colours rather than losing the included set', () => {
    const merged = mergeVscodeThemeDocuments(
      { semanticTokenColors: { variable: '#111111', property: '#222222' } },
      { semanticTokenColors: { variable: '#333333' } }
    )
    expect(merged.semanticTokenColors).toEqual({ variable: '#333333', property: '#222222' })
  })

  it('omits empty sections instead of writing empty objects', () => {
    const merged = mergeVscodeThemeDocuments({}, {})
    expect(merged.colors).toBeUndefined()
    expect(merged.tokenColors).toBeUndefined()
    expect(merged.semanticTokenColors).toBeUndefined()
  })

  it('ignores a non-object colors value on either side', () => {
    const merged = mergeVscodeThemeDocuments({ colors: 'nope' }, { colors: ['also nope'] })
    expect(merged.colors).toBeUndefined()
  })
})

describe('themeIncludePath', () => {
  it('reads a sibling include', () => {
    expect(themeIncludePath({ include: './dark_vs.json' })).toBe('./dark_vs.json')
  })

  it('reads an include in a subdirectory', () => {
    expect(themeIncludePath({ include: 'shared/base.json' })).toBe('shared/base.json')
  })

  it('answers null when there is no include', () => {
    expect(themeIncludePath({})).toBeNull()
  })

  it('refuses a parent traversal', () => {
    expect(themeIncludePath({ include: '../../../etc/passwd' })).toBeNull()
  })

  it('refuses an absolute path', () => {
    expect(themeIncludePath({ include: '/etc/passwd' })).toBeNull()
    expect(themeIncludePath({ include: '\\\\server\\share' })).toBeNull()
  })

  it('refuses an empty or non-string include', () => {
    expect(themeIncludePath({ include: '   ' })).toBeNull()
    expect(themeIncludePath({ include: 42 })).toBeNull()
  })
})

describe('unsupportedThemeFeatures', () => {
  it('names semantic highlighting when the theme relies on it', () => {
    expect(unsupportedThemeFeatures({ semanticHighlighting: true })).toContain(
      'Semantic highlighting: identifiers are coloured by scope instead'
    )
  })

  it('names semantic token colours when present', () => {
    expect(unsupportedThemeFeatures({ semanticTokenColors: { variable: '#111111' } })).toContain(
      'Semantic token colours'
    )
  })

  it('is empty for a theme that uses neither', () => {
    expect(unsupportedThemeFeatures({ colors: { 'editor.background': '#000000' } })).toEqual([])
  })
})
