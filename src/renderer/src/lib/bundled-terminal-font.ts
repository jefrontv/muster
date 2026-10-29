import { DEFAULT_TERMINAL_FONT_FAMILY } from '../../../shared/constants'

// Why: xterm measures its cell size once, when a terminal opens. If the bundled font is still
// loading, it measures the fallback font and the grid stays misaligned for that terminal.
const PRELOAD_TIMEOUT_MS = 1500

/** Resolves once the bundled terminal font's weights are loaded, or after a short timeout. */
export function preloadBundledTerminalFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) {
    return Promise.resolve()
  }
  const loads = [400, 500, 700].map((weight) =>
    document.fonts.load(`${weight} 14px "${DEFAULT_TERMINAL_FONT_FAMILY}"`)
  )
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, PRELOAD_TIMEOUT_MS))
  return Promise.race([Promise.all(loads).then(() => undefined), timeout]).catch(() => undefined)
}
