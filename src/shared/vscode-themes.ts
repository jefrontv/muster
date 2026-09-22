// An imported VS Code or Cursor theme, as Muster stores it.
//
// Shaped after `TerminalCustomTheme` on purpose: the terminal import already settled how a
// third-party theme is identified, capped, named and reported as partially supported, and a second
// answer to any of those would be a second thing to keep right.
//
// `tokenColors` is kept RAW. Syntax colour currently goes through a scope-to-token mapping, because
// Monaco's tokenizer emits its own coarse token names and cannot consume TextMate scopes directly.
// Keeping the source scopes means real TextMate tokenization can replace that mapping later and
// re-read themes people already imported, rather than asking them to import everything again.

import type { TerminalColorOverrides } from './types'

export type VscodeThemeSource = 'vscode' | 'cursor'
export type EditorThemeMode = 'dark' | 'light'

/** One `tokenColors` entry, as the file carries it. `scope` is absent on the default-style entry. */
export type VscodeTokenColor = {
  scope?: string | string[]
  settings: { foreground?: string; fontStyle?: string }
}

export type EditorCustomTheme = {
  id: string
  name: string
  source: VscodeThemeSource
  mode: EditorThemeMode
  /** Workbench colours, filtered to keys with a usable value. Monaco reads a subset of these. */
  editorColors: Record<string, string>
  tokenColors: VscodeTokenColor[]
  /** The ANSI palette, when the theme carried one. Null means it cannot dress a terminal. */
  terminal: TerminalColorOverrides | null
  importedAt: string
  /** Where it came from, for the picker: the extension label or the editor's built-in set. */
  sourceLabel?: string
  /** Named so the import dialog can say what it could not carry, rather than quietly dropping it. */
  unsupportedFeatures?: string[]
}

/** Matches the terminal cap. A settings blob is not a theme library. */
export const MAX_EDITOR_CUSTOM_THEMES = 200

/** How many `tokenColors` entries are kept. Beyond this the file is not a theme. */
const MAX_TOKEN_COLORS = 500

/**
 * 3, 4, 6 and 8 digits, lower-cased, hash-prefixed, short forms expanded.
 *
 * Four and eight digits carry alpha, and they are not exotic: `dark_vs.json`, behind VS Code's
 * own default dark theme, uses three 4-digit and one 8-digit value. They are the selection and
 * highlight overlays, so discarding alpha would paint them opaque over the code underneath —
 * which is why the terminal module's validator, which allows only 3 and 6, is not reused here.
 */
export function normalizeThemeColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const raw = value.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(raw) || ![3, 4, 6, 8].includes(raw.length)) {
    return null
  }
  const expanded =
    raw.length <= 4
      ? raw
          .split('')
          .map((character) => `${character}${character}`)
          .join('')
      : raw
  return `#${expanded.toLowerCase()}`
}

function removeControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, '')
}

export function normalizeEditorThemeId(value: unknown, fallback = 'theme'): string {
  const raw = typeof value === 'string' ? value : fallback
  const normalized = removeControlCharacters(raw)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

export function normalizeEditorThemeName(value: unknown, fallback = 'Imported Theme'): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = removeControlCharacters(value)
    .replace(/[\\/]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return normalized || fallback
}

/** `fontStyle` is a space-separated set in TextMate; only these three mean anything to Monaco. */
const FONT_STYLES = new Set(['italic', 'bold', 'underline'])

function normalizeFontStyle(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const parts = value
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => FONT_STYLES.has(part))
  return parts.length > 0 ? parts.join(' ') : undefined
}

function normalizeScope(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    const scopes = value.filter((entry): entry is string => typeof entry === 'string')
    return scopes.length > 0 ? scopes : undefined
  }
  return undefined
}

/**
 * The `tokenColors` entries worth keeping: those that actually say to paint something.
 *
 * An entry with neither a colour nor a font style has no effect, and a scope-less entry is the
 * theme's default style, which IS meaningful — it is where several themes put the base foreground.
 */
export function normalizeTokenColors(value: unknown): VscodeTokenColor[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: VscodeTokenColor[] = []
  for (const entry of value.slice(0, MAX_TOKEN_COLORS)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }
    const settings = (entry as { settings?: unknown }).settings
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      continue
    }
    const foreground = normalizeThemeColor((settings as { foreground?: unknown }).foreground)
    const fontStyle = normalizeFontStyle((settings as { fontStyle?: unknown }).fontStyle)
    if (foreground === null && fontStyle === undefined) {
      continue
    }
    const scope = normalizeScope((entry as { scope?: unknown }).scope)
    out.push({
      ...(scope === undefined ? {} : { scope }),
      settings: {
        ...(foreground === null ? {} : { foreground }),
        ...(fontStyle === undefined ? {} : { fontStyle })
      }
    })
  }
  return out
}

/** Colour entries with a usable value. Keys are kept verbatim: they are VS Code's own namespace. */
export function normalizeEditorColors(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const color = normalizeThemeColor(raw)
    if (color !== null) {
      out[key] = color
    }
  }
  return out
}

/**
 * Dark or light, from the theme's own `type` when it has one.
 *
 * The fallback reads `editor.background`'s luminance rather than assuming dark. A theme that
 * declares nothing and is guessed wrong lands in the wrong half of the picker, where someone
 * following the system setting would never see it.
 */
export function resolveEditorThemeMode(
  declaredType: unknown,
  editorColors: Record<string, string>
): EditorThemeMode {
  if (declaredType === 'light' || declaredType === 'vs') {
    return 'light'
  }
  if (declaredType === 'dark' || declaredType === 'vs-dark' || declaredType === 'hc-black') {
    return 'dark'
  }
  const background = editorColors['editor.background']
  if (background === undefined) {
    return 'dark'
  }
  const hex = background.slice(1, 7)
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  // Rec. 601 luma, which is what "is this dark" means to an eye rather than to a channel average.
  return 0.299 * red + 0.587 * green + 0.114 * blue < 128 ? 'dark' : 'light'
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const out = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => removeControlCharacters(entry).trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 20)
  return out.length > 0 ? out : undefined
}

function normalizeSource(value: unknown): VscodeThemeSource {
  return value === 'cursor' ? 'cursor' : 'vscode'
}

/** A theme is worth keeping when it can paint something. Otherwise selecting it changes nothing. */
export function hasUsableEditorThemeColors(theme: {
  editorColors: Record<string, string>
  tokenColors: readonly VscodeTokenColor[]
}): boolean {
  return Object.keys(theme.editorColors).length > 0 || theme.tokenColors.length > 0
}

/**
 * Persisted themes read back into shape, dropping any that no longer parse.
 *
 * Tolerant by design: this reads a settings file a user may have hand-edited and an older build may
 * have written, so a single bad record must cost that record and not the library.
 */
export function normalizeEditorCustomThemes(value: unknown): EditorCustomTheme[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const out: EditorCustomTheme[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }
    const record = entry as Record<string, unknown>
    const editorColors = normalizeEditorColors(record.editorColors)
    const tokenColors = normalizeTokenColors(record.tokenColors)
    if (!hasUsableEditorThemeColors({ editorColors, tokenColors })) {
      continue
    }
    const id = normalizeEditorThemeId(record.id)
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    const importedAt =
      typeof record.importedAt === 'string' && record.importedAt.length > 0
        ? record.importedAt
        : new Date(0).toISOString()
    const sourceLabel =
      typeof record.sourceLabel === 'string' && record.sourceLabel.trim().length > 0
        ? removeControlCharacters(record.sourceLabel).trim()
        : undefined
    const unsupportedFeatures = normalizeStringList(record.unsupportedFeatures)
    out.push({
      id,
      name: normalizeEditorThemeName(record.name),
      source: normalizeSource(record.source),
      mode: record.mode === 'light' ? 'light' : 'dark',
      editorColors,
      tokenColors,
      terminal: normalizeImportedTerminalColors(record.terminal),
      importedAt,
      ...(sourceLabel === undefined ? {} : { sourceLabel }),
      ...(unsupportedFeatures === undefined ? {} : { unsupportedFeatures })
    })
    if (out.length === MAX_EDITOR_CUSTOM_THEMES) {
      break
    }
  }
  return out
}

/** Null rather than `{}` when nothing usable is there, so "has no palette" stays distinguishable. */
function normalizeImportedTerminalColors(value: unknown): TerminalColorOverrides | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const input = value as Record<string, unknown>
  const output: TerminalColorOverrides = {}
  for (const [key, raw] of Object.entries(input)) {
    const color = normalizeThemeColor(raw)
    if (color !== null) {
      output[key as keyof TerminalColorOverrides] = color
    }
  }
  return Object.keys(output).length > 0 ? output : null
}

/** One row in the import dialog: a parsed theme plus whether its editor is currently using it. */
export type EditorThemeImportCandidate = EditorCustomTheme & {
  active: boolean
}

/**
 * The result of scanning for importable themes.
 *
 * Lives in shared rather than beside the scanner because it crosses the IPC boundary, and preload
 * must be able to name it without reaching into main.
 */
export type EditorThemeImportPreview = {
  found: boolean
  themes: EditorThemeImportCandidate[]
  /** Editors whose theme folders were found, for saying where the list came from. */
  editors: string[]
  /** Files that could not be read or parsed, so the dialog can be honest about it. */
  skipped: number
}
