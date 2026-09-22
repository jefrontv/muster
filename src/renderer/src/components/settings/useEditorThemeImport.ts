// The import dialog's state: scan, choose, save.
//
// The scan is not run on mount. Reading two extension folders and parsing fifty theme files is
// cheap (70ms on the machine this was written against) but it is still work nobody asked for, and
// the settings pane opens far more often than anyone imports a theme.
//
// Saving is additive. Importing the same theme twice replaces that entry rather than adding a
// second, because the id is derived from the editor, extension and label, which do not change
// between scans — so re-importing after updating an extension picks up the new colours.

import { useCallback, useState } from 'react'

import {
  MAX_EDITOR_CUSTOM_THEMES,
  normalizeEditorCustomThemes,
  type EditorCustomTheme,
  type EditorThemeImportCandidate,
  type EditorThemeImportPreview
} from '../../../../shared/vscode-themes'
import type { GlobalSettings } from '../../../../shared/types'

export type UseEditorThemeImportReturn = {
  open: boolean
  scanning: boolean
  preview: EditorThemeImportPreview | null
  error: string | null
  start: () => void
  close: () => void
  /** Saves the chosen themes and answers the ones that landed, for selecting one straight away. */
  save: (themes: readonly EditorThemeImportCandidate[], useForTerminal: boolean) => void
}

/** Drops the `active` flag, which describes the source editor rather than the stored theme. */
function toStoredTheme(candidate: EditorThemeImportCandidate): EditorCustomTheme {
  const { active: _active, ...theme } = candidate
  return theme
}

export function useEditorThemeImport(args: {
  settings: GlobalSettings
  updateSettings: (patch: Partial<GlobalSettings>) => void
}): UseEditorThemeImportReturn {
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [preview, setPreview] = useState<EditorThemeImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(() => {
    setOpen(true)
    setScanning(true)
    setError(null)
    void window.api.settings
      .previewEditorThemeImport()
      .then((result) => {
        setPreview(result)
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : 'Could not look for themes on this machine.'
        )
      })
      .finally(() => {
        setScanning(false)
      })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const save = useCallback(
    (themes: readonly EditorThemeImportCandidate[], useForTerminal: boolean) => {
      if (themes.length === 0) {
        setOpen(false)
        return
      }
      const existing = normalizeEditorCustomThemes(args.settings.editorCustomThemes)
      const incoming = themes.map(toStoredTheme)
      const incomingIds = new Set(incoming.map((theme) => theme.id))
      // Newest first so the cap drops the oldest imports rather than refusing the new ones, which
      // is the behaviour somebody re-importing after an extension update expects.
      const merged = [...incoming, ...existing.filter((theme) => !incomingIds.has(theme.id))].slice(
        0,
        MAX_EDITOR_CUSTOM_THEMES
      )

      const patch: Partial<GlobalSettings> = { editorCustomThemes: merged }

      // Select what was just imported, per mode. Importing a theme and then having to find it in a
      // dropdown is two steps where the first already said which theme was wanted.
      const dark = incoming.find((theme) => theme.mode === 'dark')
      const light = incoming.find((theme) => theme.mode === 'light')
      if (dark) {
        patch.editorThemeDark = dark.id
      }
      if (light) {
        patch.editorThemeLight = light.id
      }

      if (useForTerminal) {
        // Only from a theme that carried a full ANSI palette; `terminal` is null otherwise, and a
        // partial palette would leave the terminal half-dressed in the previous theme.
        const withPalette = incoming.find((theme) => theme.terminal !== null)
        if (withPalette?.terminal) {
          patch.terminalColorOverrides = withPalette.terminal
        }
      }

      args.updateSettings(patch)
      setOpen(false)
    },
    [args]
  )

  return { open, scanning, preview, error, start, close, save }
}
