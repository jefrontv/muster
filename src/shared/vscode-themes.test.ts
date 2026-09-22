import { describe, expect, it } from 'vitest'
import {
  hasUsableEditorThemeColors,
  MAX_EDITOR_CUSTOM_THEMES,
  normalizeEditorColors,
  normalizeEditorCustomThemes,
  normalizeEditorThemeId,
  normalizeEditorThemeName,
  normalizeThemeColor,
  normalizeTokenColors,
  resolveEditorThemeMode
} from './vscode-themes'

describe('normalizeThemeColor', () => {
  it('keeps a six-digit colour, lower-cased', () => {
    expect(normalizeThemeColor('#F9F9F9')).toBe('#f9f9f9')
  })

  it('expands three digits', () => {
    expect(normalizeThemeColor('#abc')).toBe('#aabbcc')
  })

  it('keeps eight digits, which carry alpha', () => {
    // dark_vs.json ships editor.selectionHighlightBackground as #ADD6FF26. Losing the alpha would
    // paint the highlight opaque over the code.
    expect(normalizeThemeColor('#ADD6FF26')).toBe('#add6ff26')
  })

  it('expands four digits to eight', () => {
    expect(normalizeThemeColor('#abcd')).toBe('#aabbccdd')
  })

  it('accepts a value with no leading hash', () => {
    expect(normalizeThemeColor('ff0000')).toBe('#ff0000')
  })

  it('rejects a five-digit value', () => {
    expect(normalizeThemeColor('#abcde')).toBeNull()
  })

  it('rejects a named colour', () => {
    expect(normalizeThemeColor('red')).toBeNull()
  })

  it('rejects a non-string', () => {
    expect(normalizeThemeColor(123)).toBeNull()
  })
})

describe('normalizeEditorColors', () => {
  it('keeps usable entries and drops the rest, preserving VS Code key names', () => {
    expect(
      normalizeEditorColors({
        'editor.background': '#1E1E1E',
        'editor.foreground': 'not-a-colour',
        'editor.selectionBackground': '#ADD6FF26'
      })
    ).toEqual({ 'editor.background': '#1e1e1e', 'editor.selectionBackground': '#add6ff26' })
  })

  it('answers an empty object for a non-object', () => {
    expect(normalizeEditorColors(null)).toEqual({})
    expect(normalizeEditorColors([1, 2])).toEqual({})
  })
})

describe('normalizeTokenColors', () => {
  it('keeps a scoped entry with a colour', () => {
    expect(
      normalizeTokenColors([
        { name: 'Modules', scope: ['entity.name.namespace'], settings: { foreground: '#EE5672' } }
      ])
    ).toEqual([{ scope: ['entity.name.namespace'], settings: { foreground: '#ee5672' } }])
  })

  it('keeps a scope-less entry, which is the theme default style', () => {
    expect(normalizeTokenColors([{ settings: { foreground: '#abcdef' } }])).toEqual([
      { settings: { foreground: '#abcdef' } }
    ])
  })

  it('keeps a string scope as a string', () => {
    expect(normalizeTokenColors([{ scope: 'comment', settings: { fontStyle: 'italic' } }])).toEqual([
      { scope: 'comment', settings: { fontStyle: 'italic' } }
    ])
  })

  it('keeps only font styles Monaco understands', () => {
    expect(
      normalizeTokenColors([{ scope: 'x', settings: { fontStyle: 'italic strikethrough bold' } }])
    ).toEqual([{ scope: 'x', settings: { fontStyle: 'italic bold' } }])
  })

  it('drops an entry that would paint nothing', () => {
    expect(normalizeTokenColors([{ scope: 'x', settings: {} }])).toEqual([])
    expect(normalizeTokenColors([{ scope: 'x', settings: { fontStyle: 'wobble' } }])).toEqual([])
  })

  it('drops entries with no settings object at all', () => {
    expect(normalizeTokenColors([{ scope: 'x' }, null, 'nope'])).toEqual([])
  })

  it('answers empty for a non-array', () => {
    expect(normalizeTokenColors({ scope: 'x' })).toEqual([])
  })
})

describe('resolveEditorThemeMode', () => {
  it('trusts a declared light type', () => {
    expect(resolveEditorThemeMode('light', {})).toBe('light')
  })

  it('trusts a declared dark type', () => {
    expect(resolveEditorThemeMode('dark', {})).toBe('dark')
  })

  it('reads the older vs and vs-dark spellings', () => {
    expect(resolveEditorThemeMode('vs', {})).toBe('light')
    expect(resolveEditorThemeMode('vs-dark', {})).toBe('dark')
  })

  it('falls back to the background luminance when no type is declared', () => {
    expect(resolveEditorThemeMode(undefined, { 'editor.background': '#f9f9f9' })).toBe('light')
    expect(resolveEditorThemeMode(undefined, { 'editor.background': '#1e1e1e' })).toBe('dark')
  })

  it('defaults to dark when there is nothing to read', () => {
    expect(resolveEditorThemeMode(undefined, {})).toBe('dark')
  })
})

describe('hasUsableEditorThemeColors', () => {
  it('is true with only workbench colours', () => {
    expect(
      hasUsableEditorThemeColors({ editorColors: { 'editor.background': '#000000' }, tokenColors: [] })
    ).toBe(true)
  })

  it('is true with only token colours', () => {
    // dark_plus.json before its include is resolved looks exactly like this.
    expect(
      hasUsableEditorThemeColors({
        editorColors: {},
        tokenColors: [{ scope: 'comment', settings: { foreground: '#6a9955' } }]
      })
    ).toBe(true)
  })

  it('is false when it would paint nothing', () => {
    expect(hasUsableEditorThemeColors({ editorColors: {}, tokenColors: [] })).toBe(false)
  })
})

describe('normalizeEditorThemeId and name', () => {
  it('slugs an id', () => {
    expect(normalizeEditorThemeId('Bluloco Light Italic')).toBe('bluloco-light-italic')
  })

  it('falls back when an id slugs to nothing', () => {
    expect(normalizeEditorThemeId('///')).toBe('theme')
  })

  it('cleans a name without emptying it', () => {
    expect(normalizeEditorThemeName('Winter is  Coming')).toBe('Winter is Coming')
  })

  it('falls back for a non-string name', () => {
    expect(normalizeEditorThemeName(null)).toBe('Imported Theme')
  })
})

describe('normalizeEditorCustomThemes', () => {
  const theme = {
    id: 'bluloco-light',
    name: 'Bluloco Light',
    source: 'vscode',
    mode: 'light',
    editorColors: { 'editor.background': '#F9F9F9' },
    tokenColors: [{ scope: 'comment', settings: { foreground: '#A0A1A7' } }],
    terminal: { black: '#000000', red: '#FF0000' },
    importedAt: '2026-09-22T00:00:00.000Z',
    sourceLabel: 'Bluloco Light'
  }

  it('reads a stored theme back', () => {
    expect(normalizeEditorCustomThemes([theme])).toEqual([
      {
        id: 'bluloco-light',
        name: 'Bluloco Light',
        source: 'vscode',
        mode: 'light',
        editorColors: { 'editor.background': '#f9f9f9' },
        tokenColors: [{ scope: 'comment', settings: { foreground: '#a0a1a7' } }],
        terminal: { black: '#000000', red: '#ff0000' },
        importedAt: '2026-09-22T00:00:00.000Z',
        sourceLabel: 'Bluloco Light'
      }
    ])
  })

  it('drops a record that would paint nothing rather than the whole library', () => {
    const result = normalizeEditorCustomThemes([{ id: 'empty', editorColors: {} }, theme])
    expect(result.map((entry) => entry.id)).toEqual(['bluloco-light'])
  })

  it('drops a duplicate id, keeping the first', () => {
    const result = normalizeEditorCustomThemes([theme, { ...theme, name: 'Second' }])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bluloco Light')
  })

  it('answers null terminal when the palette is unusable', () => {
    expect(normalizeEditorCustomThemes([{ ...theme, terminal: { black: 'nope' } }])[0].terminal).toBeNull()
  })

  it('caps the library', () => {
    const many = Array.from({ length: MAX_EDITOR_CUSTOM_THEMES + 25 }, (_unused, index) => ({
      ...theme,
      id: `theme-${index}`
    }))
    expect(normalizeEditorCustomThemes(many)).toHaveLength(MAX_EDITOR_CUSTOM_THEMES)
  })

  it('answers empty for a non-array', () => {
    expect(normalizeEditorCustomThemes({ id: 'x' })).toEqual([])
  })

  it('defaults a missing importedAt rather than dropping the theme', () => {
    const result = normalizeEditorCustomThemes([{ ...theme, importedAt: undefined }])
    expect(result[0].importedAt).toBe('1970-01-01T00:00:00.000Z')
  })
})
