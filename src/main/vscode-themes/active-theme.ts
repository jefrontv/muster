// Which theme the user is actually looking at in each editor.
//
// Worth reading for one reason: it turns the import from a list of 38 names into "this is the one
// you use, import it". A picker that makes somebody find Dark Modern among ten Default Themes
// entries has spent their attention on a question the settings file already answers.
//
// `settings.json` is JSONC and reliably has comments in it — VS Code writes the file with them and
// users add their own — so it goes through the same reader the theme files do.

import { readFile } from 'node:fs/promises'

import { parseJsonc } from '../../shared/jsonc-parse'
import type { EditorInstallPaths } from './editor-installs'
import type { EditorKind } from './editor-installs'

/** Settings files are small; a megabyte is already far past anything a human edits. */
const MAX_SETTINGS_BYTES = 1_000_000

export type ActiveThemeEnv = {
  readTextFile: (path: string) => Promise<string | null>
}

export function createDefaultActiveThemeEnv(): ActiveThemeEnv {
  return {
    readTextFile: async (path) => {
      try {
        const contents = await readFile(path, 'utf8')
        return contents.length > MAX_SETTINGS_BYTES ? null : contents
      } catch {
        return null
      }
    }
  }
}

type EditorSettings = {
  'workbench.colorTheme'?: unknown
  'workbench.preferredDarkColorTheme'?: unknown
  'workbench.preferredLightColorTheme'?: unknown
}

export type ActiveThemeNames = {
  kind: EditorKind
  /** The theme label, matching `contributes.themes[].label`. Null when unset or unreadable. */
  colorTheme: string | null
  /** Set when the editor follows the system appearance; both are then in play. */
  preferredDark: string | null
  preferredLight: string | null
}

function readName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export async function readActiveThemeNames(
  install: EditorInstallPaths,
  env: ActiveThemeEnv = createDefaultActiveThemeEnv()
): Promise<ActiveThemeNames> {
  const raw = await env.readTextFile(install.settingsFile)
  const settings = raw === null ? null : parseJsonc<EditorSettings>(raw)
  return {
    kind: install.kind,
    colorTheme: readName(settings?.['workbench.colorTheme']),
    preferredDark: readName(settings?.['workbench.preferredDarkColorTheme']),
    preferredLight: readName(settings?.['workbench.preferredLightColorTheme'])
  }
}

/**
 * Every theme name this editor is currently using, for marking rows in the picker.
 *
 * More than one, because an editor set to follow the system has a dark choice and a light choice
 * and `workbench.colorTheme` names only whichever is showing right now. Marking just that one
 * would tell somebody half of what they have.
 */
export function activeThemeNameSet(names: ActiveThemeNames): Set<string> {
  return new Set(
    [names.colorTheme, names.preferredDark, names.preferredLight].filter(
      (name): name is string => name !== null
    )
  )
}
