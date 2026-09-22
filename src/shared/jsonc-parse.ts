// JSON with comments and trailing commas, which is what editor config and theme files actually are.
//
// Why this is needed at all: every VS Code theme file opened while planning this needed `//` lines
// removed before `JSON.parse` would touch it, and `dark_plus.json` — the file behind VS Code's
// default theme — is one of them. `JSON.parse` on a theme file is not a shortcut, it is a bug.
//
// The scan is character by character and string-aware on purpose. A regex that strips `//` to end
// of line also destroys `"url": "https://example.com"` and `"foreground": "#abc // not a comment"`,
// and colour and URL values in these files are exactly where `//` shows up legitimately.

/** Null for input that is not valid even after comments and trailing commas are allowed for. */
export function parseJsonc<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(stripJsonc(text)) as T
  } catch {
    return null
  }
}

/**
 * Comments replaced by nothing, trailing commas dropped, everything inside strings left alone.
 *
 * Exported for its own tests: the failure mode worth covering is silent damage to a string value,
 * which a round trip through `JSON.parse` would hide behind a plausible-looking result.
 */
export function stripJsonc(text: string): string {
  let out = ''
  let index = 0
  let inString = false

  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]

    if (inString) {
      // A backslash consumes whatever follows, so an escaped quote does not end the string and an
      // escaped backslash does not escape the quote after it.
      if (char === '\\') {
        out += char + (next ?? '')
        index += 2
        continue
      }
      if (char === '"') {
        inString = false
      }
      out += char
      index += 1
      continue
    }

    if (char === '"') {
      inString = true
      out += char
      index += 1
      continue
    }

    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') {
        index += 1
      }
      continue
    }

    if (char === '/' && next === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        index += 1
      }
      index += 2
      continue
    }

    if (char === ',') {
      // Look past whitespace for the closer. Comments are already gone by the time we are here on
      // any character we have passed, but the ones AHEAD are not, so skip those too or
      // `[1, /* last */]` keeps its comma.
      const after = skipToSignificant(text, index + 1)
      if (text[after] === '}' || text[after] === ']') {
        index += 1
        continue
      }
    }

    out += char
    index += 1
  }

  return out
}

/** The next index that is neither whitespace nor part of a comment. */
function skipToSignificant(text: string, from: number): number {
  let index = from
  while (index < text.length) {
    const char = text[index]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1
      continue
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') {
        index += 1
      }
      continue
    }
    if (char === '/' && text[index + 1] === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        index += 1
      }
      index += 2
      continue
    }
    return index
  }
  return index
}
