// Narrow readers for loosely typed stream-json records.

export type Rec = Record<string, unknown>

export function asRecord(value: unknown): Rec | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Rec)
    : null
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function strings(value: unknown, pick?: (entry: Rec) => unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    const picked = pick ? pick(asRecord(entry) ?? {}) : entry
    return typeof picked === 'string' ? [picked] : []
  })
}
