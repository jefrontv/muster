// IPC hands the renderer fresh objects for every patched turn. Folding the new
// turn onto the old one keeps unchanged items (and their memoized rows) intact,
// so one streaming token re-renders only the item it lands in.

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

/** `next`, with every subtree that deep-equals its `prev` counterpart replaced by `prev`. */
export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (prev === next) {
    return next
  }
  const arrays = Array.isArray(prev) && Array.isArray(next)
  if (!arrays && !(isPlainObject(prev) && isPlainObject(next))) {
    return next
  }
  const prevRecord = prev as Record<string, unknown>
  const nextRecord = next as Record<string, unknown>
  const keys = arrays ? (next as unknown[]).map((_, index) => String(index)) : Object.keys(next)
  const prevSize = arrays ? (prev as unknown[]).length : Object.keys(prev as object).length
  const out: Record<string, unknown> | unknown[] = arrays ? [] : {}
  let same = prevSize === keys.length
  for (const key of keys) {
    const value = replaceEqualDeep(prevRecord[key], nextRecord[key])
    ;(out as Record<string, unknown>)[key] = value
    if (value !== prevRecord[key] || (!arrays && !(key in prevRecord))) {
      same = false
    }
  }
  return (same ? prev : out) as T
}
