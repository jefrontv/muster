// FNV-1a: stable across sessions and platforms, so an id always draws the same identicon.
export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * 5x5 identicon cells from an id: 15 free cells (columns 0 to 2), mirrored left to right.
 * Returns row-major booleans; never empty, so every id draws something.
 */
export function identiconCells(id: string): boolean[] {
  let bits = fnv1a32(id) & 0x7fff
  if (bits === 0) {
    bits = 0x5555
  }
  const cells: boolean[] = []
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const source = col < 3 ? col : 4 - col
      cells.push(((bits >> (row * 3 + source)) & 1) === 1)
    }
  }
  return cells
}
