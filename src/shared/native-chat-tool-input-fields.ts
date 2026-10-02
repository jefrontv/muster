// Reading the few fields tool rows need out of an untyped tool input, and the
// path/URL shortening both surfaces share.

export function inputField(input: unknown, key: string): string | null {
  if (typeof input !== 'object' || input === null) {
    return null
  }
  const value = (input as Record<string, unknown>)[key]
  if (typeof value === 'string' && value.trim() !== '') {
    return value
  }
  return typeof value === 'number' ? String(value) : null
}

export function inputPath(input: unknown): string | null {
  return (
    inputField(input, 'file_path') ??
    inputField(input, 'notebook_path') ??
    inputField(input, 'filePath') ??
    inputField(input, 'path')
  )
}

export function pathFileName(path: string): string {
  return path.split(/[\\/]/).findLast((part) => part !== '') ?? path
}

/** Relative to the working folder when inside it; otherwise unchanged. */
export function relativeToolPath(path: string, cwd: string | null | undefined): string {
  if (!cwd) {
    return path
  }
  const base = cwd.replace(/[\\/]+$/, '')
  if (path === base) {
    return pathFileName(path)
  }
  if (path.startsWith(`${base}/`) || path.startsWith(`${base}\\`)) {
    return path.slice(base.length + 1)
  }
  return path
}

export function urlDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function firstLine(text: string, max = 120): string {
  const line =
    text
      .split('\n')
      .find((entry) => entry.trim() !== '')
      ?.trim() ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Scalar inputs as `key: value` pairs, for a key/value detail list. */
export function inputScalarFields(input: unknown): { key: string; value: string }[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return []
  }
  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? [{ key, value: String(value) }]
      : value === null || value === undefined
        ? []
        : [{ key, value: JSON.stringify(value) ?? '' }]
  )
}

/** "Compare the spacing" → "compare the spacing", so it reads after a verb. */
export function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? `${text[0]!.toLowerCase()}${text.slice(1)}` : text
}
