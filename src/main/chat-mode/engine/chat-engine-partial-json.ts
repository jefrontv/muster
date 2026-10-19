// Best-effort parse of a tool input that is still streaming as input_json_delta
// chunks, so a running Bash or Edit row can show its arguments as they arrive.

type Frame = { closer: '}' | ']'; expectsKey: boolean }

const closersOf = (stack: readonly Frame[]): string =>
  stack.reduceRight((closers, frame) => closers + frame.closer, '')

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The value so far: open strings, objects and arrays are closed; a half-written key or literal is dropped. */
export function parsePartialJson(text: string): unknown {
  const stack: Frame[] = []
  let inString = false
  let stringIsKey = false
  let escaped = false
  // Longest prefix that closes into valid JSON, and the closers it needs.
  let safeEnd = -1
  let safeClosers = ''
  const markSafe = (end: number): void => {
    safeEnd = end
    safeClosers = closersOf(stack)
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
        if (!stringIsKey) {
          markSafe(index + 1)
        }
      }
      continue
    }
    const frame = stack.at(-1)
    switch (char) {
      case '"':
        inString = true
        stringIsKey = frame?.closer === '}' && frame.expectsKey
        break
      case '{':
      case '[':
        stack.push({ closer: char === '{' ? '}' : ']', expectsKey: char === '{' })
        markSafe(index + 1)
        break
      case '}':
      case ']':
        stack.pop()
        markSafe(index + 1)
        break
      case ':':
        if (frame) {
          frame.expectsKey = false
        }
        break
      case ',':
        // A number or literal ends at its comma; everything before is complete.
        markSafe(index)
        if (frame?.closer === '}') {
          frame.expectsKey = true
        }
        break
      default:
        break
    }
  }

  if (inString && !stringIsKey) {
    // Drop a dangling backslash or half a \uXXXX escape before closing the string.
    const body = text.replace(/\\(u[0-9a-fA-F]{0,3})?$/, '')
    const value = tryParse(`${body}"${closersOf(stack)}`)
    if (value !== undefined) {
      return value
    }
  }
  if (!inString) {
    const value = tryParse(`${text}${closersOf(stack)}`)
    if (value !== undefined) {
      return value
    }
  }
  return safeEnd > 0 ? tryParse(`${text.slice(0, safeEnd)}${safeClosers}`) : undefined
}
