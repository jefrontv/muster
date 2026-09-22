// Every theme an editor offers, found the way the editor itself finds them.
//
// A theme is not a loose JSON file: it is declared by an extension's `package.json` under
// `contributes.themes`, as a label plus a relative path. That declaration is the only place the
// human-readable name lives — the file it points at often has no `name` at all, and one extension
// routinely declares several themes from one folder. Winter is Coming declares six.
//
// Built-in themes are found the same way, because they ARE extensions: `theme-defaults` ships a
// `package.json` beside its `themes` folder exactly like an installed one does. That is what lets
// this treat both with one scan instead of a second code path that guesses names from filenames.

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { parseJsonc } from '../../shared/jsonc-parse'
import { normalizeEditorThemeId, normalizeEditorThemeName } from '../../shared/vscode-themes'
import type { EditorInstallPaths } from './editor-installs'
import type { VscodeThemeSource } from '../../shared/vscode-themes'

export type ThemeCandidate = {
  /** Stable across scans, so a re-import updates a theme rather than duplicating it. */
  id: string
  name: string
  source: VscodeThemeSource
  /** The extension that declares it, or the editor's name for a built-in. */
  sourceLabel: string
  filePath: string
  /** The directory an `include` may not escape. */
  themesDir: string
  /** `vs`, `vs-dark` or `hc-black` from the declaration, when it states one. */
  uiTheme?: string
  /**
   * The declaration's own `id`, which is what `workbench.colorTheme` stores when a theme has one.
   *
   * Not interchangeable with the label, and that is the whole point: the built-in dark theme is
   * `id: "Visual Studio Dark"` with `label: "Dark (Visual Studio)"`, so matching the setting
   * against the label alone finds nothing and the user's current theme goes unmarked.
   */
  declaredId?: string
}

export type ThemeCatalogEnv = {
  listDirectory: (path: string) => Promise<string[]>
  readTextFile: (path: string) => Promise<string | null>
}

export function createDefaultThemeCatalogEnv(): ThemeCatalogEnv {
  return {
    listDirectory: async (path) => {
      try {
        return await readdir(path)
      } catch {
        return []
      }
    },
    readTextFile: async (path) => {
      try {
        return await readFile(path, 'utf8')
      } catch {
        return null
      }
    }
  }
}

type ContributedTheme = { label?: unknown; path?: unknown; uiTheme?: unknown; id?: unknown }

/**
 * `%key%` swapped for the string `package.nls.json` gives it.
 *
 * Not a nicety. Every theme VS Code ships names itself this way, so without it the picker offers
 * `%darkPlusColorThemeLabel%` and `%darkModernThemeLabel%` where it should say "Dark+" and "Dark
 * Modern" — 20 of the 38 themes found on the machine this was written against, and precisely the
 * ones most people use. Installed extensions mostly inline their strings, which is why the problem
 * is invisible until the bundled themes are scanned.
 *
 * An unresolved key is returned as it stands rather than blanked: a visible `%key%` is a bug report
 * waiting to happen, an empty row is a mystery.
 */
function resolveNlsString(value: string, strings: Record<string, string> | null): string {
  if (!value.startsWith('%') || !value.endsWith('%') || value.length < 3) {
    return value
  }
  const key = value.slice(1, -1)
  return strings?.[key] ?? value
}

async function readNlsStrings(
  extensionDir: string,
  env: ThemeCatalogEnv
): Promise<Record<string, string> | null> {
  const raw = await env.readTextFile(join(extensionDir, 'package.nls.json'))
  if (raw === null) {
    return null
  }
  const parsed = parseJsonc<Record<string, unknown>>(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry === 'string') {
      out[key] = entry
    } else if (entry && typeof entry === 'object' && typeof (entry as { message?: unknown }).message === 'string') {
      // Newer manifests wrap a string as { message, comment } so translators get context.
      out[key] = (entry as { message: string }).message
    }
  }
  return out
}
type ExtensionManifest = {
  name?: unknown
  displayName?: unknown
  contributes?: { themes?: unknown }
}

/** Themes declared by one extension directory, or none when it declares no themes. */
async function themesFromExtensionDir(
  extensionDir: string,
  source: VscodeThemeSource,
  fallbackLabel: string | null,
  env: ThemeCatalogEnv
): Promise<ThemeCandidate[]> {
  const raw = await env.readTextFile(join(extensionDir, 'package.json'))
  if (raw === null) {
    return []
  }
  // parseJsonc rather than JSON.parse: a manifest should be strict JSON, but the cost of tolerating
  // one that is not is nil and the cost of dropping an extension over a comment is a missing theme.
  const manifest = parseJsonc<ExtensionManifest>(raw)
  const declared = manifest?.contributes?.themes
  if (!Array.isArray(declared)) {
    return []
  }
  const nls = await readNlsStrings(extensionDir, env)
  const declaredName =
    typeof manifest?.displayName === 'string' && manifest.displayName.trim().length > 0
      ? resolveNlsString(manifest.displayName.trim(), nls)
      : typeof manifest?.name === 'string'
        ? manifest.name
        : (fallbackLabel ?? 'Unknown extension')
  const extensionName = declaredName

  const out: ThemeCandidate[] = []
  for (const entry of declared as ContributedTheme[]) {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string') {
      continue
    }
    // A declared path is relative to the extension root and may not leave it.
    if (entry.path.includes('..')) {
      continue
    }
    const label =
      typeof entry.label === 'string' && entry.label.trim().length > 0
        ? resolveNlsString(entry.label.trim(), nls)
        : typeof entry.id === 'string'
          ? entry.id
          : null
    if (label === null) {
      continue
    }
    const filePath = join(extensionDir, entry.path)
    out.push({
      // Namespaced by editor and extension: two editors can ship a theme of the same name, and
      // without the extension in the key two labels from one folder would collide.
      id: normalizeEditorThemeId(`${source}-${extensionName}-${label}`),
      name: normalizeEditorThemeName(label),
      source,
      sourceLabel: extensionName,
      filePath,
      themesDir: dirname(filePath),
      ...(typeof entry.uiTheme === 'string' ? { uiTheme: entry.uiTheme } : {}),
      ...(typeof entry.id === 'string' && entry.id.trim().length > 0
        ? { declaredId: entry.id.trim() }
        : {})
    })
  }
  return out
}

/**
 * Every theme one editor install offers: its installed extensions, then its bundled ones.
 *
 * A missing directory is not a failure. Most machines have one of these editors and not the other,
 * and an unreadable extensions folder should cost that folder rather than the scan.
 */
export async function themesForEditor(
  install: EditorInstallPaths,
  env: ThemeCatalogEnv = createDefaultThemeCatalogEnv()
): Promise<ThemeCandidate[]> {
  const out: ThemeCandidate[] = []
  const seen = new Set<string>()

  const push = (candidates: ThemeCandidate[]): void => {
    for (const candidate of candidates) {
      if (!seen.has(candidate.id)) {
        seen.add(candidate.id)
        out.push(candidate)
      }
    }
  }

  const extensionDirs = await env.listDirectory(install.extensionsDir)
  for (const entry of extensionDirs) {
    push(
      await themesFromExtensionDir(
        join(install.extensionsDir, entry),
        install.kind,
        entry,
        env
      )
    )
  }

  // The bundled directories point at `<extension>/themes`, so the manifest is one level up.
  for (const themesDir of install.builtinThemesDirs) {
    push(await themesFromExtensionDir(dirname(themesDir), install.kind, install.label, env))
  }

  return out
}

/** Both editors, in order, so a picker can group by where a theme came from. */
export async function themesForEditors(
  installs: readonly EditorInstallPaths[],
  env: ThemeCatalogEnv = createDefaultThemeCatalogEnv()
): Promise<ThemeCandidate[]> {
  const out: ThemeCandidate[] = []
  for (const install of installs) {
    out.push(...(await themesForEditor(install, env)))
  }
  return out
}
