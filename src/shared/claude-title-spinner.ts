// Claude Code 2.1.30x animates its working title with quarter-circle frames
// (◐ ◓ ◑ ◒) in place of the older braille spinner.
const CLAUDE_SPINNER_GLYPHS = new Set(['◐', '◑', '◒', '◓'])

/** A title led by a Claude working frame: "◐ task" or the bare glyph. */
export function isClaudeSpinnerTitle(title: string): boolean {
  return CLAUDE_SPINNER_GLYPHS.has(title.charAt(0)) && (title.length === 1 || title[1] === ' ')
}

/** Drops the leading working frame so a stale exit title stops reading as working. */
export function stripClaudeSpinner(title: string): string {
  return isClaudeSpinnerTitle(title) ? title.slice(1).trimStart() : title
}
