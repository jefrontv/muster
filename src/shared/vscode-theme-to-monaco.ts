// A VS Code theme turned into a Monaco theme.
//
// The two halves are not equally faithful, and the plan says so out loud. `colors` transfers
// key-for-key: Monaco reads the same `editor.background`, `editorLineNumber.foreground`,
// `editor.selectionBackground` names VS Code writes, so backgrounds, gutter, selection and the rest
// of the chrome come out exact.
//
// `tokenColors` cannot. VS Code colours syntax by matching TextMate scopes emitted by a TextMate
// grammar; Monaco colours it by matching the coarse token names its own Monarch tokenizers emit
// (`comment`, `keyword`, `string`, `type`, …). There is no `meta.function-call.generic` in Monaco
// to paint, so each Monaco token is given the colour of the nearest scope the theme does define,
// through the table below. Recognisably the theme, not pixel-identical to it. The raw scopes stay
// on the stored record so real TextMate tokenization can replace this later.
//
// Rule colours are SIX digits with no hash. Monaco's own theme validator rejects anything else,
// which is why `ruleColor` exists beside the `colors` half that takes `#rrggbbaa` happily.

import type { EditorCustomTheme, VscodeTokenColor } from './vscode-themes'

export type MonacoThemeRule = {
  token: string
  foreground?: string
  fontStyle?: string
}

export type MonacoThemeData = {
  base: 'vs' | 'vs-dark'
  inherit: true
  rules: MonacoThemeRule[]
  colors: Record<string, string>
}

/**
 * Monaco token names, each with the TextMate scopes to look for, most specific first.
 *
 * Ordered by how much of a screen the token covers, because when two entries would resolve to the
 * same colour the earlier one is the one worth spending a rule on. The scope lists are the ones
 * themes actually populate: every scope here appears in the default VS Code themes, so a theme that
 * styles nothing else still produces a usable result.
 */
const MONACO_TOKEN_SCOPES: readonly { token: string; scopes: readonly string[] }[] = [
  { token: 'comment', scopes: ['comment', 'punctuation.definition.comment'] },
  { token: 'string', scopes: ['string', 'string.quoted'] },
  { token: 'string.escape', scopes: ['constant.character.escape', 'string'] },
  { token: 'regexp', scopes: ['string.regexp', 'string'] },
  { token: 'number', scopes: ['constant.numeric', 'constant'] },
  { token: 'constant', scopes: ['constant.language', 'constant'] },
  { token: 'keyword', scopes: ['keyword', 'keyword.control'] },
  { token: 'operator', scopes: ['keyword.operator', 'keyword'] },
  { token: 'predefined', scopes: ['support.function', 'support'] },
  { token: 'function', scopes: ['entity.name.function', 'support.function'] },
  { token: 'type', scopes: ['entity.name.type', 'support.type', 'storage.type'] },
  { token: 'type.identifier', scopes: ['entity.name.type', 'support.type'] },
  { token: 'class', scopes: ['entity.name.type.class', 'entity.name.class', 'entity.name.type'] },
  { token: 'interface', scopes: ['entity.name.type.interface', 'entity.name.type'] },
  { token: 'namespace', scopes: ['entity.name.namespace', 'entity.name.type'] },
  { token: 'variable', scopes: ['variable', 'variable.other'] },
  { token: 'variable.predefined', scopes: ['variable.language', 'variable'] },
  { token: 'parameter', scopes: ['variable.parameter', 'variable'] },
  { token: 'property', scopes: ['variable.other.property', 'support.type.property-name'] },
  { token: 'identifier', scopes: ['variable.other', 'variable'] },
  { token: 'tag', scopes: ['entity.name.tag', 'entity.name'] },
  { token: 'metatag', scopes: ['meta.tag', 'entity.name.tag'] },
  { token: 'attribute.name', scopes: ['entity.other.attribute-name', 'entity.other.attribute'] },
  { token: 'attribute.value', scopes: ['string.quoted', 'string'] },
  { token: 'delimiter', scopes: ['punctuation', 'punctuation.separator'] },
  { token: 'delimiter.bracket', scopes: ['punctuation.definition.block', 'punctuation'] },
  { token: 'key', scopes: ['support.type.property-name', 'variable.other.property'] },
  { token: 'annotation', scopes: ['storage.type.annotation', 'entity.name.function'] },
  { token: 'invalid', scopes: ['invalid', 'invalid.illegal'] }
]

/** The scope list of one `tokenColors` entry, as an array whatever shape the file used. */
function scopeList(entry: VscodeTokenColor): string[] {
  if (entry.scope === undefined) {
    return []
  }
  return Array.isArray(entry.scope) ? entry.scope : entry.scope.split(',').map((s) => s.trim())
}

/**
 * How well a theme's scope selector covers a target scope, or -1 for no match.
 *
 * TextMate scopes nest on dots, and a selector matches any scope it is a prefix of: `entity.name`
 * styles `entity.name.function` unless something more specific also matches. The score is the
 * selector's own depth, so the most specific matching selector wins — which is the rule TextMate
 * itself applies, and without it `comment` would beat `comment.line.double-slash`.
 *
 * Only the last element of a compound selector such as `meta.class entity.name` is considered.
 * Ancestor requirements cannot be evaluated without a document, and treating them as if they had
 * matched would hand a descendant's colour to every occurrence of the token.
 */
export function scopeMatchScore(selector: string, target: string): number {
  const parts = selector.trim().split(/\s+/)
  const leaf = parts.at(-1)
  if (leaf === undefined || leaf.length === 0) {
    return -1
  }
  if (leaf === target) {
    return leaf.split('.').length
  }
  if (target.startsWith(`${leaf}.`)) {
    return leaf.split('.').length
  }
  return -1
}

/**
 * The style the theme gives one TextMate scope, by the most specific selector that covers it.
 *
 * The scope-less entry is the theme's default style and is deliberately NOT consulted here: it
 * applies to everything, so letting it answer would paint every Monaco token the same colour and
 * flatten the file. It is applied once, as the editor foreground, by the caller.
 *
 * Equal specificity goes to the LAST entry, because an included theme's entries are merged ahead of
 * the including theme's: Dark Modern reaches `dark_vs.json` through two levels of `include`, and on
 * a tie the value the derived theme restated is the one it meant to change.
 */
export function styleForScope(
  tokenColors: readonly VscodeTokenColor[],
  target: string
): VscodeTokenColor['settings'] | null {
  let best: VscodeTokenColor['settings'] | null = null
  let bestScore = 0
  for (const entry of tokenColors) {
    for (const selector of scopeList(entry)) {
      const score = scopeMatchScore(selector, target)
      if (score > 0 && score >= bestScore) {
        bestScore = score
        best = entry.settings
      }
    }
  }
  return best
}

/** Monaco rules take `rrggbb`: no hash, no alpha. Alpha is dropped rather than the whole colour. */
export function ruleColor(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const raw = value.replace(/^#/, '')
  return raw.length >= 6 ? raw.slice(0, 6) : undefined
}

/** The theme's `tokenColors` entry with no scope, which is its base text style. */
export function defaultTokenStyle(
  tokenColors: readonly VscodeTokenColor[]
): VscodeTokenColor['settings'] | null {
  for (const entry of tokenColors) {
    if (scopeList(entry).length === 0) {
      return entry.settings
    }
  }
  return null
}

export function editorThemeToMonaco(theme: EditorCustomTheme): MonacoThemeData {
  const rules: MonacoThemeRule[] = []

  // The empty-token rule is Monaco's base text style, and the theme's scope-less entry is the same
  // idea, so they are the same rule. Without it, unrecognised tokens keep the inherited base
  // theme's foreground and a light theme built on `vs-dark` shows grey text on its own white.
  const base = defaultTokenStyle(theme.tokenColors)
  const baseForeground = ruleColor(base?.foreground ?? theme.editorColors['editor.foreground'])
  if (baseForeground !== undefined) {
    rules.push({ token: '', foreground: baseForeground })
  }

  for (const { token, scopes } of MONACO_TOKEN_SCOPES) {
    for (const scope of scopes) {
      const style = styleForScope(theme.tokenColors, scope)
      if (style === null) {
        continue
      }
      const foreground = ruleColor(style.foreground)
      if (foreground === undefined && style.fontStyle === undefined) {
        continue
      }
      rules.push({
        token,
        ...(foreground === undefined ? {} : { foreground }),
        ...(style.fontStyle === undefined ? {} : { fontStyle: style.fontStyle })
      })
      break
    }
  }

  return {
    // Inheriting from the matching base fills in every editor colour the theme leaves unset, which
    // for a theme carrying 30 colours is most of them.
    base: theme.mode === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules,
    colors: monacoColors(theme.editorColors)
  }
}

/**
 * The colour keys Monaco reads. Passing the other ~340 is not harmless: Monaco validates the names
 * it is given and an unknown one makes it reject the theme, taking the ones it does understand with
 * it.
 */
const MONACO_COLOR_KEYS: readonly string[] = [
  'editor.background',
  'editor.foreground',
  'editor.lineHighlightBackground',
  'editor.lineHighlightBorder',
  'editor.selectionBackground',
  'editor.selectionForeground',
  'editor.selectionHighlightBackground',
  'editor.inactiveSelectionBackground',
  'editor.wordHighlightBackground',
  'editor.wordHighlightStrongBackground',
  'editor.findMatchBackground',
  'editor.findMatchHighlightBackground',
  'editor.hoverHighlightBackground',
  'editor.rangeHighlightBackground',
  'editorCursor.foreground',
  'editorWhitespace.foreground',
  'editorLineNumber.foreground',
  'editorLineNumber.activeForeground',
  'editorIndentGuide.background',
  'editorIndentGuide.activeBackground',
  'editorGutter.background',
  'editorGutter.addedBackground',
  'editorGutter.deletedBackground',
  'editorGutter.modifiedBackground',
  'editorBracketMatch.background',
  'editorBracketMatch.border',
  'editorError.foreground',
  'editorWarning.foreground',
  'editorInfo.foreground',
  'editorOverviewRuler.border',
  'editorRuler.foreground',
  'editorCodeLens.foreground',
  'diffEditor.insertedTextBackground',
  'diffEditor.removedTextBackground',
  'scrollbarSlider.background',
  'scrollbarSlider.hoverBackground',
  'scrollbarSlider.activeBackground',
  'minimap.background'
]

export function monacoColors(editorColors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of MONACO_COLOR_KEYS) {
    const value = editorColors[key]
    if (value !== undefined) {
      out[key] = value
    }
  }
  return out
}

/** The Monaco theme name for an imported theme. Namespaced so it cannot collide with `vs-dark`. */
export function monacoThemeName(themeId: string): string {
  return `muster-${themeId}`
}
