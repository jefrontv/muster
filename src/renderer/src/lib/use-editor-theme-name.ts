// The Monaco theme name for the current settings, registered and ready to pass to an editor.
//
// One hook rather than the expression it replaces, because there are six Monaco surfaces — the
// editor, the diff viewer, diff sections, the notebook viewer and code excerpts — and they all used
// to spell `isDark ? 'vs-dark' : 'vs'` inline. Six copies of a rule is six chances for a diff pane
// to stay on VS Dark while the editor beside it follows an imported theme.
//
// Registration runs inside the hook so any surface that mounts first does it, and the memo on the
// stored themes keeps it to once per actual change rather than once per render.

import { useMemo } from 'react'

import { useAppStore } from '@/store'
import { registerEditorThemes, resolveEditorTheme } from './editor-theme'
import { normalizeEditorCustomThemes } from '../../../shared/vscode-themes'

/**
 * `isDark` is passed in rather than read here: the surfaces disagree about how they get it — some
 * read `settings.theme` directly, one goes through `resolveDocumentTheme`, one takes it as a prop —
 * and centralising that is a separate change from centralising the theme name.
 */
export function useEditorThemeName(isDark: boolean): string {
  const stored = useAppStore((state) => state.settings?.editorCustomThemes)
  const dark = useAppStore((state) => state.settings?.editorThemeDark)
  const light = useAppStore((state) => state.settings?.editorThemeLight)

  const themes = useMemo(() => normalizeEditorCustomThemes(stored), [stored])
  const available = useMemo(() => registerEditorThemes(themes), [themes])

  return useMemo(
    () =>
      resolveEditorTheme({
        settings: { editorCustomThemes: themes, editorThemeDark: dark, editorThemeLight: light },
        isDark,
        available
      }).themeName,
    [themes, dark, light, isDark, available]
  )
}
