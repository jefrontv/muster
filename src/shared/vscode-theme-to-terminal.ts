// The ANSI palette out of a VS Code theme, for the terminal.
//
// Worth doing because it is nearly free: a theme file already carries all sixteen `terminal.ansi*`
// colours plus a terminal background and foreground — verified on Bluloco Light, which has all 16 —
// and those map one-to-one onto `TerminalColorOverrides`. One import then dresses the editor and
// the terminal together, which is what actually makes Muster look like the editor someone came from.
//
// Alpha is dropped here, unlike on the editor side. These are text and background colours for a
// grid of cells, and a translucent ANSI red composited over whatever is behind the terminal is not
// what the theme meant by red.

import { normalizeThemeColor } from './vscode-themes'
import type { TerminalColorOverrides } from './types'

/** VS Code's colour key to xterm's override key. */
const TERMINAL_COLOR_MAP: readonly [string, keyof TerminalColorOverrides][] = [
  ['terminal.foreground', 'foreground'],
  ['terminal.background', 'background'],
  ['terminalCursor.foreground', 'cursor'],
  ['terminalCursor.background', 'cursorAccent'],
  ['terminal.selectionBackground', 'selectionBackground'],
  ['terminal.selectionForeground', 'selectionForeground'],
  ['terminal.ansiBlack', 'black'],
  ['terminal.ansiRed', 'red'],
  ['terminal.ansiGreen', 'green'],
  ['terminal.ansiYellow', 'yellow'],
  ['terminal.ansiBlue', 'blue'],
  ['terminal.ansiMagenta', 'magenta'],
  ['terminal.ansiCyan', 'cyan'],
  ['terminal.ansiWhite', 'white'],
  ['terminal.ansiBrightBlack', 'brightBlack'],
  ['terminal.ansiBrightRed', 'brightRed'],
  ['terminal.ansiBrightGreen', 'brightGreen'],
  ['terminal.ansiBrightYellow', 'brightYellow'],
  ['terminal.ansiBrightBlue', 'brightBlue'],
  ['terminal.ansiBrightMagenta', 'brightMagenta'],
  ['terminal.ansiBrightCyan', 'brightCyan'],
  ['terminal.ansiBrightWhite', 'brightWhite']
]

/** The eight base ANSI names. A palette missing any of these is not a palette. */
const REQUIRED_ANSI: readonly (keyof TerminalColorOverrides)[] = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white'
]

/** Six digits, no alpha: a translucent ANSI colour is not what the theme meant. */
function opaqueColor(value: unknown): string | null {
  const normalized = normalizeThemeColor(value)
  return normalized === null ? null : `#${normalized.slice(1, 7)}`
}

/**
 * The palette, or null when the theme does not carry a usable one.
 *
 * Null rather than a partial set, because a terminal given four of eight ANSI colours takes the
 * other four from the previous theme and ends up in neither. The editor background stands in for a
 * missing `terminal.background`, since that is what VS Code itself shows.
 */
export function editorThemeTerminalColors(
  editorColors: Record<string, string>
): TerminalColorOverrides | null {
  const out: TerminalColorOverrides = {}
  for (const [source, target] of TERMINAL_COLOR_MAP) {
    const color = opaqueColor(editorColors[source])
    if (color !== null) {
      out[target] = color
    }
  }
  if (!REQUIRED_ANSI.every((key) => out[key] !== undefined)) {
    return null
  }
  if (out.background === undefined) {
    const fallback = opaqueColor(editorColors['editor.background'])
    if (fallback !== null) {
      out.background = fallback
    }
  }
  if (out.foreground === undefined) {
    const fallback = opaqueColor(editorColors['editor.foreground'])
    if (fallback !== null) {
      out.foreground = fallback
    }
  }
  return out
}
