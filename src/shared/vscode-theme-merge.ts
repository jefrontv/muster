// Merging a theme file with the file it includes.
//
// Not optional, and not rare. VS Code's current default reaches its syntax colours through three
// levels: `2026-dark.json` includes `dark_modern.json`, which includes `dark_plus.json`, which
// includes `dark_vs.json`. The colours and the syntax rules live at different levels of that chain
// — `dark_modern.json` carries 126 workbench colours and zero token colours, `dark_plus.json`
// carries zero colours and 15 token colours — so a reader that ignores `include` produces a theme
// with a background and no syntax highlighting, or syntax highlighting on the wrong background.
//
// The rules are VS Code's: the including file wins on `colors` and on the scalars, and its
// `tokenColors` are appended AFTER the included file's, which is what makes the last-wins
// tie-breaking in `styleForScope` correct.

/** A theme file as parsed, before anything is normalized. */
export type VscodeThemeDocument = {
  name?: unknown
  type?: unknown
  include?: unknown
  colors?: unknown
  tokenColors?: unknown
  semanticTokenColors?: unknown
  semanticHighlighting?: unknown
}

function asColorRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * `derived` layered over `included`.
 *
 * `include` is dropped from the result: it has been followed, and leaving it would let a caller
 * follow it a second time.
 */
export function mergeVscodeThemeDocuments(
  included: VscodeThemeDocument,
  derived: VscodeThemeDocument
): VscodeThemeDocument {
  const colors = { ...asColorRecord(included.colors), ...asColorRecord(derived.colors) }
  const tokenColors = [...asArray(included.tokenColors), ...asArray(derived.tokenColors)]
  const semantic = {
    ...asColorRecord(included.semanticTokenColors),
    ...asColorRecord(derived.semanticTokenColors)
  }
  return {
    // The derived file names the theme; the included one is an implementation detail of it. Both
    // `name` and `type` fall back, because a file in the middle of a chain often states neither.
    name: derived.name ?? included.name,
    type: derived.type ?? included.type,
    ...(Object.keys(colors).length > 0 ? { colors } : {}),
    ...(tokenColors.length > 0 ? { tokenColors } : {}),
    ...(Object.keys(semantic).length > 0 ? { semanticTokenColors: semantic } : {}),
    semanticHighlighting: derived.semanticHighlighting ?? included.semanticHighlighting
  }
}

/** The relative path a theme file includes, or null when it includes nothing usable. */
export function themeIncludePath(document: VscodeThemeDocument): string | null {
  if (typeof document.include !== 'string') {
    return null
  }
  const trimmed = document.include.trim()
  if (trimmed.length === 0) {
    return null
  }
  // An absolute path or a parent traversal is a theme reaching outside its own extension, which no
  // legitimate theme does and which is the one shape worth refusing outright.
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.includes('..')) {
    return null
  }
  return trimmed
}

/**
 * What the import could not carry, for the dialog to show.
 *
 * Semantic highlighting is the honest one: when a theme sets `semanticHighlighting` and ships
 * `semanticTokenColors`, VS Code colours identifiers from the language server rather than from
 * TextMate scopes, and those colours are the ones people notice missing.
 */
export function unsupportedThemeFeatures(document: VscodeThemeDocument): string[] {
  const out: string[] = []
  if (document.semanticHighlighting === true) {
    out.push('Semantic highlighting: identifiers are coloured by scope instead')
  }
  if (Object.keys(asColorRecord(document.semanticTokenColors)).length > 0) {
    out.push('Semantic token colours')
  }
  return out
}
