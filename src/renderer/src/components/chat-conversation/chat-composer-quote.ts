// A quoted reply travels as a Markdown blockquote ahead of the user's text, so
// Claude reads it as context and the user bubble can show it apart.

const QUOTE_MAX_CHARS = 600

/** Trims a reply to the part worth quoting: at most 600 characters, cut at a word. */
export function quoteExcerpt(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= QUOTE_MAX_CHARS) {
    return trimmed
  }
  const cut = trimmed.slice(0, QUOTE_MAX_CHARS)
  const space = cut.lastIndexOf(' ')
  return `${(space > QUOTE_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export function quoteMessage(quote: string, text: string): string {
  const block = quote
    .trim()
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n')
  return text.trim() === '' ? block : `${block}\n\n${text}`
}

/** Splits a leading blockquote off a sent message; null quote when it has none. */
export function splitQuotedMessage(text: string): { quote: string | null; body: string } {
  const lines = text.split('\n')
  let end = 0
  while (end < lines.length && lines[end].startsWith('>')) {
    end += 1
  }
  if (end === 0) {
    return { quote: null, body: text }
  }
  const quote = lines
    .slice(0, end)
    .map((line) => line.replace(/^> ?/, ''))
    .join('\n')
    .trim()
  return { quote: quote || null, body: lines.slice(end).join('\n').trim() }
}
