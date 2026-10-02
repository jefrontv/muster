// Pure terminal theme composition, kept free of xterm runtime and pane-tree imports so App start
// can publish terminal view attributes without pulling the terminal stack into the entry chunk.
import type { ITheme } from '@xterm/xterm'
import type { GlobalSettings } from '../../../../shared/types'
import {
  getBuiltinTheme,
  resolveEffectiveTerminalAppearance,
  resolveTerminalCursorThemeColors
} from '@/lib/terminal-theme'
import { HEX_COLOR_RE } from '../../../../shared/color-validation'
import type { TerminalViewAttributes } from '../../../../shared/terminal-view-attributes'
import { publishTerminalViewAttributes } from './terminal-view-attributes-publisher'

export function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.replace('#', '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value)
}

// Why extracted: lets the settings preview compose the same theme without depending on PaneManager. Keep pure.
export function composeActiveTerminalTheme(
  baseTheme: ITheme | null,
  settings: Pick<
    GlobalSettings,
    | 'terminalColorOverrides'
    | 'terminalBackgroundOpacity'
    | 'terminalCursorOpacity'
    | 'terminalCursorUseThemeColor'
  >
): ITheme | null {
  if (!baseTheme) {
    return null
  }
  // Why transparent ruler border: scrollbar.width enables xterm's overview ruler, whose border would paint a bright line.
  // Why raised slider alpha: xterm's default (~0.2) is nearly invisible on dark bg. Before the spread so explicit theme wins.
  let theme: ITheme = {
    overviewRulerBorder: 'transparent',
    scrollbarSliderBackground: 'rgba(180, 180, 185, 0.4)',
    scrollbarSliderHoverBackground: 'rgba(180, 180, 185, 0.6)',
    scrollbarSliderActiveBackground: 'rgba(180, 180, 185, 0.8)',
    ...baseTheme
  }
  // Why: merge Ghostty color overrides atop the base theme so individual colors can be tweaked without losing the rest.
  if (settings.terminalColorOverrides) {
    theme = { ...theme, ...settings.terminalColorOverrides }
  }
  // After the overrides, so reverse video is measured against the colors actually on screen. The
  // helper leaves an explicitly overridden cursor alone: override > opt-out > theme.
  theme = { ...theme, ...resolveTerminalCursorThemeColors(theme, settings) }
  // Why: convert the hex background to rgba so xterm honors the opacity when allowTransparency is set.
  if (settings.terminalBackgroundOpacity !== undefined && theme.background) {
    theme = {
      ...theme,
      background: hexToRgba(theme.background, settings.terminalBackgroundOpacity)
    }
  }
  // Why hex-only: hexToRgba expects a hex input, so named CSS cursor colors are left untouched.
  if (settings.terminalCursorOpacity !== undefined && theme.cursor && isHexColor(theme.cursor)) {
    theme = {
      ...theme,
      cursor: hexToRgba(theme.cursor, settings.terminalCursorOpacity)
    }
  }
  return theme
}

/** Publishes composed terminal appearance at app start so hidden-at-launch PTYs can query OSC 10/11
 *  before any pane mounts (terminal-query-authority.md §Phase 6). Returns whether a publish went out. */
export function publishTerminalViewAttributesAtAppStart(
  settings: GlobalSettings | null | undefined,
  systemPrefersDark: boolean,
  send?: (attributes: TerminalViewAttributes) => boolean
): boolean {
  if (!settings) {
    return false
  }
  const appearance = resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
  const baseTheme: ITheme | null = appearance.theme ?? getBuiltinTheme(appearance.themeName)
  const theme = composeActiveTerminalTheme(baseTheme, settings)
  return send !== undefined
    ? publishTerminalViewAttributes(theme, appearance.mode, settings, send)
    : publishTerminalViewAttributes(theme, appearance.mode, settings)
}
