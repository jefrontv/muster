import { describe, expect, it } from 'vitest'
import {
  defaultTokenStyle,
  editorThemeToMonaco,
  monacoColors,
  monacoThemeName,
  ruleColor,
  scopeMatchScore,
  styleForScope
} from './vscode-theme-to-monaco'
import type { EditorCustomTheme } from './vscode-themes'

function theme(overrides: Partial<EditorCustomTheme> = {}): EditorCustomTheme {
  return {
    id: 'test',
    name: 'Test',
    source: 'vscode',
    mode: 'dark',
    editorColors: {},
    tokenColors: [],
    terminal: null,
    importedAt: '2026-09-22T00:00:00.000Z',
    ...overrides
  }
}

describe('scopeMatchScore', () => {
  it('scores an exact match by depth', () => {
    expect(scopeMatchScore('comment.line', 'comment.line')).toBe(2)
  })

  it('scores a prefix match by the selector depth, not the target depth', () => {
    expect(scopeMatchScore('comment', 'comment.line.double-slash')).toBe(1)
  })

  it('does not match a partial segment', () => {
    // `comment` must not style `commentary.thing`: the dot boundary is the whole rule.
    expect(scopeMatchScore('comment', 'commentary.thing')).toBe(-1)
  })

  it('does not match a more specific selector against a broader target', () => {
    expect(scopeMatchScore('comment.line', 'comment')).toBe(-1)
  })

  it('uses only the last element of a descendant selector', () => {
    expect(scopeMatchScore('meta.class entity.name', 'entity.name.function')).toBe(2)
  })

  it('rejects an empty selector', () => {
    expect(scopeMatchScore('   ', 'comment')).toBe(-1)
  })
})

describe('styleForScope', () => {
  const tokenColors = [
    { scope: 'comment', settings: { foreground: '#666666' } },
    { scope: 'comment.line.double-slash', settings: { foreground: '#00ff00' } },
    { scope: ['keyword', 'storage.type'], settings: { foreground: '#ff00ff' } }
  ]

  it('prefers the most specific matching selector', () => {
    expect(styleForScope(tokenColors, 'comment.line.double-slash')).toEqual({
      foreground: '#00ff00'
    })
  })

  it('falls back to the broader selector when nothing more specific matches', () => {
    expect(styleForScope(tokenColors, 'comment.block')).toEqual({ foreground: '#666666' })
  })

  it('reads any selector in an array', () => {
    expect(styleForScope(tokenColors, 'storage.type')).toEqual({ foreground: '#ff00ff' })
  })

  it('reads a comma-separated string selector', () => {
    const style = styleForScope([{ scope: 'a.b, c.d', settings: { foreground: '#111111' } }], 'c.d')
    expect(style).toEqual({ foreground: '#111111' })
  })

  it('answers null when nothing matches', () => {
    expect(styleForScope(tokenColors, 'entity.name.tag')).toBeNull()
  })

  it('never answers with the scope-less default entry', () => {
    // It applies to everything, so letting it match would paint every token one colour.
    expect(styleForScope([{ settings: { foreground: '#abcdef' } }], 'comment')).toBeNull()
  })
})

describe('ruleColor', () => {
  it('strips the hash', () => {
    expect(ruleColor('#ff0000')).toBe('ff0000')
  })

  it('drops alpha rather than the colour', () => {
    // Monaco's rule validator rejects eight digits outright, so truncating keeps the rule.
    expect(ruleColor('#add6ff26')).toBe('add6ff')
  })

  it('rejects a value too short to be a colour', () => {
    expect(ruleColor('#abc')).toBeUndefined()
  })

  it('passes undefined through', () => {
    expect(ruleColor(undefined)).toBeUndefined()
  })
})

describe('defaultTokenStyle', () => {
  it('finds the scope-less entry', () => {
    expect(
      defaultTokenStyle([
        { scope: 'comment', settings: { foreground: '#111111' } },
        { settings: { foreground: '#222222' } }
      ])
    ).toEqual({ foreground: '#222222' })
  })

  it('answers null when every entry is scoped', () => {
    expect(defaultTokenStyle([{ scope: 'comment', settings: { foreground: '#111111' } }])).toBeNull()
  })
})

describe('monacoColors', () => {
  it('keeps the keys Monaco reads', () => {
    expect(
      monacoColors({ 'editor.background': '#1e1e1e', 'editorCursor.foreground': '#ffffff' })
    ).toEqual({ 'editor.background': '#1e1e1e', 'editorCursor.foreground': '#ffffff' })
  })

  it('drops workbench keys Monaco would reject', () => {
    // An unknown key makes Monaco reject the whole theme, taking the valid keys with it.
    expect(monacoColors({ 'sideBar.background': '#000000', 'titleBar.border': '#111111' })).toEqual(
      {}
    )
  })

  it('keeps an alpha value, which the colors half accepts', () => {
    expect(monacoColors({ 'editor.selectionBackground': '#add6ff26' })).toEqual({
      'editor.selectionBackground': '#add6ff26'
    })
  })
})

describe('editorThemeToMonaco', () => {
  it('picks the base from the theme mode', () => {
    expect(editorThemeToMonaco(theme({ mode: 'light' })).base).toBe('vs')
    expect(editorThemeToMonaco(theme({ mode: 'dark' })).base).toBe('vs-dark')
  })

  it('always inherits, so unset colours come from the matching built-in', () => {
    expect(editorThemeToMonaco(theme()).inherit).toBe(true)
  })

  it('maps a comment scope onto the comment token', () => {
    const result = editorThemeToMonaco(
      theme({ tokenColors: [{ scope: 'comment', settings: { foreground: '#6a9955' } }] })
    )
    expect(result.rules).toContainEqual({ token: 'comment', foreground: '6a9955' })
  })

  it('carries a font style through', () => {
    const result = editorThemeToMonaco(
      theme({
        tokenColors: [{ scope: 'comment', settings: { foreground: '#6a9955', fontStyle: 'italic' } }]
      })
    )
    expect(result.rules).toContainEqual({
      token: 'comment',
      foreground: '6a9955',
      fontStyle: 'italic'
    })
  })

  it('gives the base token the scope-less style', () => {
    const result = editorThemeToMonaco(
      theme({ tokenColors: [{ settings: { foreground: '#d4d4d4' } }] })
    )
    expect(result.rules[0]).toEqual({ token: '', foreground: 'd4d4d4' })
  })

  it('falls back to editor.foreground for the base token', () => {
    // A light theme built on the vs-dark base would otherwise show grey text on its own white.
    const result = editorThemeToMonaco(theme({ editorColors: { 'editor.foreground': '#383a42' } }))
    expect(result.rules[0]).toEqual({ token: '', foreground: '383a42' })
  })

  it('falls through to the next scope when the first is unstyled', () => {
    // `function` looks for entity.name.function, then support.function.
    const result = editorThemeToMonaco(
      theme({ tokenColors: [{ scope: 'support.function', settings: { foreground: '#dcdcaa' } }] })
    )
    expect(result.rules).toContainEqual({ token: 'function', foreground: 'dcdcaa' })
  })

  it('emits one rule per token, not one per scope tried', () => {
    const result = editorThemeToMonaco(
      theme({
        tokenColors: [
          { scope: 'entity.name.function', settings: { foreground: '#dcdcaa' } },
          { scope: 'support.function', settings: { foreground: '#4ec9b0' } }
        ]
      })
    )
    expect(result.rules.filter((rule) => rule.token === 'function')).toHaveLength(1)
  })

  it('produces no token rules for a theme that styles no scopes', () => {
    const result = editorThemeToMonaco(theme({ editorColors: { 'editor.background': '#000000' } }))
    expect(result.rules).toEqual([])
    expect(result.colors).toEqual({ 'editor.background': '#000000' })
  })
})

describe('monacoThemeName', () => {
  it('namespaces the name so it cannot collide with a built-in', () => {
    expect(monacoThemeName('bluloco-light')).toBe('muster-bluloco-light')
  })
})

describe('styleForScope tie-breaking across include levels', () => {
  it('lets the later entry win at equal specificity', () => {
    // An included theme is merged ahead of the theme that includes it, so on a tie the derived
    // theme's restated value is the one it meant to change.
    const style = styleForScope(
      [
        { scope: 'comment', settings: { foreground: '#111111' } },
        { scope: 'comment', settings: { foreground: '#222222' } }
      ],
      'comment'
    )
    expect(style).toEqual({ foreground: '#222222' })
  })

  it('still lets specificity beat position', () => {
    const style = styleForScope(
      [
        { scope: 'comment.line', settings: { foreground: '#111111' } },
        { scope: 'comment', settings: { foreground: '#222222' } }
      ],
      'comment.line'
    )
    expect(style).toEqual({ foreground: '#111111' })
  })
})
