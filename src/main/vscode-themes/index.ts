// The import preview: every theme found, already parsed, with the ones in use marked.
//
// Parsed up front rather than on selection, because the preview has to show a swatch and say which
// themes carry a terminal palette, and both of those need the file read anyway. Thirty-eight themes
// on the machine this was written against, each a small JSON file plus an include chain, which is
// well inside the budget for one user-initiated scan.
//
// Nothing here throws. A theme that will not parse is dropped from the list and counted, because
// one bad extension must not empty a dialog that had 37 good answers in it.

import { homedir } from 'node:os'

import {
  normalizeEditorColors,
  normalizeEditorThemeName,
  normalizeTokenColors,
  resolveEditorThemeMode,
  hasUsableEditorThemeColors,
  type EditorCustomTheme,
  type EditorThemeImportCandidate,
  type EditorThemeImportPreview
} from '../../shared/vscode-themes'
import { unsupportedThemeFeatures } from '../../shared/vscode-theme-merge'
import { editorThemeTerminalColors } from '../../shared/vscode-theme-to-terminal'
import { activeThemeNameSet, readActiveThemeNames } from './active-theme'
import { editorInstallPaths } from './editor-installs'
import { readThemeDocument } from './theme-document-reader'
import { themesForEditor, type ThemeCandidate } from './theme-catalog'

export type { EditorThemeImportCandidate, EditorThemeImportPreview }

/**
 * The declared `uiTheme` beats luminance, because the extension author stated it.
 *
 * It is on the declaration rather than in the theme file, so it is the one mode signal available
 * without opening anything, and themes that omit `type` in the file often still declare it here.
 */
function modeFromCandidate(
  candidate: ThemeCandidate,
  declaredType: unknown,
  editorColors: Record<string, string>
): EditorCustomTheme['mode'] {
  if (candidate.uiTheme === 'vs') {
    return 'light'
  }
  if (candidate.uiTheme === 'vs-dark' || candidate.uiTheme === 'hc-black') {
    return 'dark'
  }
  return resolveEditorThemeMode(declaredType, editorColors)
}

async function readCandidate(
  candidate: ThemeCandidate,
  activeNames: ReadonlySet<string>,
  importedAt: string
): Promise<EditorThemeImportCandidate | null> {
  const result = await readThemeDocument(candidate.filePath, candidate.themesDir)
  if (result === null) {
    return null
  }
  const editorColors = normalizeEditorColors(result.document.colors)
  const tokenColors = normalizeTokenColors(result.document.tokenColors)
  if (!hasUsableEditorThemeColors({ editorColors, tokenColors })) {
    return null
  }
  const unsupported = unsupportedThemeFeatures(result.document)
  return {
    id: candidate.id,
    // The extension's declared label wins over the file's own `name`: it is what the editor's own
    // picker shows, so it is the name the user will be looking for.
    name: normalizeEditorThemeName(candidate.name),
    source: candidate.source,
    mode: modeFromCandidate(candidate, result.document.type, editorColors),
    editorColors,
    tokenColors,
    terminal: editorThemeTerminalColors(editorColors),
    importedAt,
    sourceLabel: candidate.sourceLabel,
    ...(unsupported.length > 0 ? { unsupportedFeatures: unsupported } : {}),
    // Either spelling: `workbench.colorTheme` holds the declared id when there is one and the
    // label otherwise, and the built-in themes are precisely the ones where those differ.
    active:
      activeNames.has(candidate.name) ||
      (candidate.declaredId !== undefined && activeNames.has(candidate.declaredId))
  }
}

/** Every theme both editors offer, parsed and ready to show. */
export async function previewEditorThemeImport(): Promise<EditorThemeImportPreview> {
  const installs = editorInstallPaths({
    homeDir: homedir(),
    platform: process.platform,
    env: process.env
  })
  const importedAt = new Date().toISOString()
  const themes: EditorThemeImportCandidate[] = []
  const editors: string[] = []
  let skipped = 0

  for (const install of installs) {
    const candidates = await themesForEditor(install)
    if (candidates.length === 0) {
      continue
    }
    editors.push(install.label)
    const activeNames = activeThemeNameSet(await readActiveThemeNames(install))
    for (const candidate of candidates) {
      const theme = await readCandidate(candidate, activeNames, importedAt)
      if (theme === null) {
        skipped += 1
        continue
      }
      themes.push(theme)
    }
  }

  // Active first, then by name. Somebody importing wants the theme they use, and making them find
  // it among ten "Default Themes" rows is the difference between one click and a hunt.
  themes.sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })

  return { found: themes.length > 0, themes, editors, skipped }
}
