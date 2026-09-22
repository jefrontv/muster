// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const defineTheme = vi.fn()
vi.mock('monaco-editor', () => ({ editor: { defineTheme: (...args: unknown[]) => defineTheme(...args) } }))

const {
  BUILTIN_EDITOR_THEME_DARK,
  BUILTIN_EDITOR_THEME_LIGHT,
  clearRegisteredEditorThemes,
  editorThemeOptions,
  registerEditorThemes,
  resolveEditorTheme
} = await import('./editor-theme')

import type { EditorCustomTheme } from '../../../shared/vscode-themes'

function theme(overrides: Partial<EditorCustomTheme> = {}): EditorCustomTheme {
  return {
    id: 'bluloco-light',
    name: 'Bluloco Light',
    source: 'vscode',
    mode: 'light',
    editorColors: { 'editor.background': '#f9f9f9' },
    tokenColors: [{ scope: 'comment', settings: { foreground: '#a0a1a7' } }],
    terminal: null,
    importedAt: '2026-09-22T00:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  defineTheme.mockReset()
  clearRegisteredEditorThemes()
})

describe('registerEditorThemes', () => {
  it('registers a theme under a namespaced name', () => {
    const available = registerEditorThemes([theme()])
    expect(defineTheme).toHaveBeenCalledWith('muster-bluloco-light', expect.objectContaining({ base: 'vs' }))
    expect(available).toEqual(new Set(['muster-bluloco-light']))
  })

  it('does not re-register an unchanged theme', () => {
    registerEditorThemes([theme()])
    registerEditorThemes([theme()])
    expect(defineTheme).toHaveBeenCalledTimes(1)
  })

  it('re-registers after a fresh import of the same id', () => {
    // Re-importing keeps the id, so the id alone would leave a stale definition standing.
    registerEditorThemes([theme()])
    registerEditorThemes([theme({ importedAt: '2026-09-23T00:00:00.000Z' })])
    expect(defineTheme).toHaveBeenCalledTimes(2)
  })

  it('leaves out a theme Monaco rejects rather than throwing', () => {
    defineTheme.mockImplementation(() => {
      throw new Error('bad theme')
    })
    expect(registerEditorThemes([theme()])).toEqual(new Set())
  })

  it('keeps the good themes when one is rejected', () => {
    defineTheme.mockImplementation((name: string) => {
      if (name === 'muster-broken') {
        throw new Error('bad theme')
      }
    })
    const available = registerEditorThemes([theme({ id: 'broken' }), theme()])
    expect(available).toEqual(new Set(['muster-bluloco-light']))
  })
})

describe('resolveEditorTheme', () => {
  it('falls back to Monaco dark when nothing is chosen', () => {
    const result = resolveEditorTheme({ settings: {}, isDark: true })
    expect(result).toEqual({ mode: 'dark', themeName: BUILTIN_EDITOR_THEME_DARK, theme: null })
  })

  it('falls back to Monaco light in light mode', () => {
    expect(resolveEditorTheme({ settings: {}, isDark: false }).themeName).toBe(
      BUILTIN_EDITOR_THEME_LIGHT
    )
  })

  it('uses the light choice in light mode', () => {
    const result = resolveEditorTheme({
      settings: { editorCustomThemes: [theme()], editorThemeLight: 'bluloco-light' },
      isDark: false
    })
    expect(result.themeName).toBe('muster-bluloco-light')
    expect(result.theme?.name).toBe('Bluloco Light')
  })

  it('does not use the light choice in dark mode', () => {
    const result = resolveEditorTheme({
      settings: { editorCustomThemes: [theme()], editorThemeLight: 'bluloco-light' },
      isDark: true
    })
    expect(result.themeName).toBe(BUILTIN_EDITOR_THEME_DARK)
  })

  it('falls back when the chosen theme is no longer stored', () => {
    const result = resolveEditorTheme({
      settings: { editorCustomThemes: [], editorThemeDark: 'gone' },
      isDark: true
    })
    expect(result.themeName).toBe(BUILTIN_EDITOR_THEME_DARK)
  })

  it('falls back when the theme was rejected at registration', () => {
    // Naming a theme Monaco does not know leaves it on whatever it had, which reads as the
    // setting being silently ignored.
    const result = resolveEditorTheme({
      settings: { editorCustomThemes: [theme()], editorThemeLight: 'bluloco-light' },
      isDark: false,
      available: new Set()
    })
    expect(result.themeName).toBe(BUILTIN_EDITOR_THEME_LIGHT)
  })

  it('uses the theme when registration confirmed it', () => {
    const result = resolveEditorTheme({
      settings: { editorCustomThemes: [theme()], editorThemeLight: 'bluloco-light' },
      isDark: false,
      available: new Set(['muster-bluloco-light'])
    })
    expect(result.themeName).toBe('muster-bluloco-light')
  })

  it('ignores a stored theme that no longer normalizes', () => {
    const result = resolveEditorTheme({
      settings: {
        editorCustomThemes: [{ id: 'bluloco-light' } as unknown as EditorCustomTheme],
        editorThemeLight: 'bluloco-light'
      },
      isDark: false
    })
    expect(result.themeName).toBe(BUILTIN_EDITOR_THEME_LIGHT)
  })
})

describe('editorThemeOptions', () => {
  it('always offers the built-in first', () => {
    const options = editorThemeOptions([], 'dark')
    expect(options).toEqual([
      { value: '', label: 'Monaco Dark', group: 'built-in', mode: 'dark' }
    ])
  })

  it('lists only themes matching the appearance', () => {
    // A light theme as the dark choice is white on white, and nothing can fix that at render time.
    const options = editorThemeOptions(
      [theme(), theme({ id: 'abyss', name: 'Abyss', mode: 'dark' })],
      'dark'
    )
    expect(options.map((option) => option.value)).toEqual(['', 'abyss'])
  })

  it('sorts imported themes by name', () => {
    const options = editorThemeOptions(
      [
        theme({ id: 'z', name: 'Zed Light' }),
        theme({ id: 'a', name: 'Atom One Light' })
      ],
      'light'
    )
    expect(options.map((option) => option.label)).toEqual([
      'Monaco Light',
      'Atom One Light',
      'Zed Light'
    ])
  })

  it('carries the source label through for the picker', () => {
    const options = editorThemeOptions([theme({ sourceLabel: 'Bluloco Light Theme' })], 'light')
    expect(options[1]).toMatchObject({ group: 'imported', sourceLabel: 'Bluloco Light Theme' })
  })
})
