// The one-line preview a collapsed reasoning row shows next to its title.

const clean = (line: string): string =>
  line
    .trim()
    .replace(/[*_#`]/g, '')
    .slice(0, 200)

function firstLine(text: string): string {
  const trimmed = text.trimStart()
  const newline = trimmed.indexOf('\n')
  return newline === -1 ? trimmed : trimmed.slice(0, newline)
}

/** First line of the newest paragraph whose first line has finished, so streaming never shows a half-written line. */
function latestCompletedFirstLine(text: string): string {
  const paragraphBreak = /\r?\n(?:[\t ]*\r?\n)+/g
  let summary = ''
  let start = 0
  for (;;) {
    const next = paragraphBreak.exec(text)
    const end = next ? next.index + next[0].indexOf('\n') : text.length
    const newline = text.indexOf('\n', start)
    if (newline !== -1 && newline <= end) {
      const candidate = text.slice(start, newline).trim()
      if (candidate) {
        summary = candidate
      }
    }
    if (!next) {
      return summary
    }
    start = next.index + next[0].length
  }
}

export function reasoningPreview(text: string, streaming: boolean): string {
  return clean(streaming ? latestCompletedFirstLine(text) : firstLine(text))
}
