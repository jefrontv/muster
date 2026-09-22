// Which Monaco theme the editor should be on, and registering the imported ones.
//
// Shaped after `terminal-theme.ts`, which already settled the questions this has to answer: a dark
// choice, a light choice, and following the system when the app is set to. Answering them a second
// way would let the terminal and the editor disagree about what "dark" means.
//
// Registration is separate from resolution on purpose. `defineTheme` is a global side effect on the
// Monaco module and has to happen before any editor asks for the theme by name, while resolution is
// a pure function of the settings and runs on every render.

import * as monaco from 'monaco-editor'

import { editorThemeToMonaco, monacoThemeName } from '../../../shared/vscode-theme-to-monaco'
import { normalizeEditorCustomThemes, type EditorCustomTheme } from '../../../shared/vscode-themes'
import type { GlobalSettings } from '../../../shared/types'

/** Monaco's own themes, which are the fallback and the base every imported theme inherits from. */
export const BUILTIN_EDITOR_THEME_DARK = 'vs-dark'
export const BUILTIN_EDITOR_THEME_LIGHT = 'vs'

export type EditorThemeOption = {
  /** The stored id, or '' for the built-in. */
  value: string
  label: string
  group: 'built-in' | 'imported'
  sourceLabel?: string
  mode: EditorCustomTheme['mode']
}

/** Themes already handed to Monaco, so a re-render does not re-register what has not changed. */
const registered = new Map<string, string>()

/** Test seam: the map is module-scoped, so a test that did not clear it would leak into the next. */
export function clearRegisteredEditorThemes(): void {
  registered.clear()
}

/**
 * Registers every imported theme with Monaco, and answers the names it can now be asked for.
 *
 * Keyed by `importedAt` rather than by id alone: re-importing a theme keeps its id, so the id on
 * its own would let a stale definition stand. Cheap either way — `defineTheme` is a map write.
 *
 * Monaco throws on a theme it considers malformed, which would take down whichever component
 * happened to render first. One bad theme costs itself here instead.
 */
export function registerEditorThemes(themes: readonly EditorCustomTheme[]): Set<string> {
  const available = new Set<string>()
  for (const theme of themes) {
    const name = monacoThemeName(theme.id)
    available.add(name)
    if (registered.get(name) === theme.importedAt) {
      continue
    }
    try {
      monaco.editor.defineTheme(name, editorThemeToMonaco(theme))
      registered.set(name, theme.importedAt)
    } catch {
      // Left out of `available` so resolution falls back rather than naming a theme Monaco rejected.
      available.delete(name)
    }
  }
  return available
}

export type EffectiveEditorTheme = {
  mode: 'dark' | 'light'
  /** The Monaco theme name to pass to an editor. Always a name Monaco knows. */
  themeName: string
  /** The imported theme in play, or null when this is one of Monaco's own. */
  theme: EditorCustomTheme | null
}

/**
 * The theme for the current appearance, falling back to Monaco's own.
 *
 * Falls back whenever the chosen theme is missing or was rejected at registration, because naming
 * an unknown theme leaves Monaco on whatever it had and produces the one bug nobody can diagnose:
 * an editor that ignores the setting silently.
 */
export function resolveEditorTheme(args: {
  settings: Pick<GlobalSettings, 'editorCustomThemes' | 'editorThemeDark' | 'editorThemeLight'>
  isDark: boolean
  /** From `registerEditorThemes`. Undefined skips the check, for callers that cannot register. */
  available?: ReadonlySet<string>
}): EffectiveEditorTheme {
  const mode = args.isDark ? 'dark' : 'light'
  const fallback = args.isDark ? BUILTIN_EDITOR_THEME_DARK : BUILTIN_EDITOR_THEME_LIGHT
  const themes = normalizeEditorCustomThemes(args.settings.editorCustomThemes)
  const wanted = args.isDark ? args.settings.editorThemeDark : args.settings.editorThemeLight
  if (!wanted) {
    return { mode, themeName: fallback, theme: null }
  }
  const theme = themes.find((entry) => entry.id === wanted)
  if (!theme) {
    return { mode, themeName: fallback, theme: null }
  }
  const name = monacoThemeName(theme.id)
  if (args.available !== undefined && !args.available.has(name)) {
    return { mode, themeName: fallback, theme: null }
  }
  return { mode, themeName: name, theme }
}

/** Rows for the picker: Monaco's own first, then what has been imported, grouped and named. */
export function editorThemeOptions(
  themes: readonly EditorCustomTheme[],
  mode: 'dark' | 'light'
): EditorThemeOption[] {
  const builtin: EditorThemeOption = {
    value: '',
    label: mode === 'dark' ? 'Monaco Dark' : 'Monaco Light',
    group: 'built-in',
    mode
  }
  // Only themes for this appearance: offering a light theme as the dark choice produces white-on-
  // white, and there is no sensible way for the editor to correct that at render time.
  const imported = themes
    .filter((theme) => theme.mode === mode)
    .map((theme) => ({
      value: theme.id,
      label: theme.name,
      group: 'imported' as const,
      ...(theme.sourceLabel === undefined ? {} : { sourceLabel: theme.sourceLabel }),
      mode: theme.mode
    }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }))
  return [builtin, ...imported]
}
