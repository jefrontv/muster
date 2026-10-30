// Ported from the muster-bots fork (src/lib/table-data.ts, src/lib/table-fit.ts), Apache-2.0.
// Sorting, filtering, CSV and column fitting for a reply's table card.

export type ChatTableSort = { column: number; descending: boolean } | null

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const INTEGER = /^[+-]?\d+$/

export function isTableNumber(text: string): boolean {
  return NUMBER.test(text.trim())
}

function compareCells(left: string, right: string): number {
  const l = left.trim()
  const r = right.trim()
  if (!isTableNumber(l) || !isTableNumber(r)) {
    return collator.compare(left, right)
  }
  // BigInt keeps long IDs exact where Number would round them.
  if (INTEGER.test(l) && INTEGER.test(r)) {
    const a = BigInt(l)
    const b = BigInt(r)
    return a < b ? -1 : a > b ? 1 : 0
  }
  const difference = Number(l) - Number(r)
  return Number.isFinite(difference) ? difference : collator.compare(left, right)
}

/** Row indexes matching the query, in sort order; empty cells sort last either way. */
export function tableRowOrder(
  rows: readonly (readonly string[])[],
  query: string,
  sort: ChatTableSort
): number[] {
  const needle = query.trim().toLocaleLowerCase()
  const order = rows.flatMap((row, index) =>
    !needle || row.some((cell) => cell.toLocaleLowerCase().includes(needle)) ? [index] : []
  )
  if (sort) {
    order.sort((a, b) => {
      const left = rows[a]![sort.column] ?? ''
      const right = rows[b]![sort.column] ?? ''
      if (!left.trim() || !right.trim()) {
        return Number(!left.trim()) - Number(!right.trim()) || a - b
      }
      return compareCells(left, right) * (sort.descending ? -1 : 1) || a - b
    })
  }
  return order
}

/** Cycles a column through ascending, descending and unsorted. */
export function nextTableSort(sort: ChatTableSort, column: number): ChatTableSort {
  if (sort?.column !== column) {
    return { column, descending: false }
  }
  return sort.descending ? null : { column, descending: true }
}

// A cell opening with one of these runs as a formula in a spreadsheet.
const FORMULA_START = /^[=+\-@\t\r]/

function csvCell(text: string): string {
  const safe = FORMULA_START.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(safe) || safe !== text ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function tableCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

/** Bounds for a column's narrowest width, in characters of the table's 14px text, and the width of one. */
const COLUMN_MIN_CHARS = 4
const COLUMN_MAX_CHARS = 12
const CHAR_PX = 7.5
const SAMPLE_ROWS = 100
/** A cell's left and right padding (px-3). */
const CELL_PADDING_PX = 24

/** How narrow each column may get before its words break: its longest word, within bounds, in px. */
export function columnMinimums(
  header: readonly string[],
  rows: readonly (readonly string[])[]
): number[] {
  return header.map((title, index) => {
    let longest = 0
    for (const text of [title, ...rows.slice(0, SAMPLE_ROWS).map((row) => row[index] ?? '')]) {
      for (const word of text.split(/\s+/)) {
        longest = Math.max(longest, [...word].length)
      }
    }
    return Math.round(Math.min(COLUMN_MAX_CHARS, Math.max(COLUMN_MIN_CHARS, longest)) * CHAR_PX)
  })
}

/** A wrapping table short enough to draw whole fits its columns to the room it has; otherwise it scrolls sideways. */
export function fitsColumns(options: {
  wrap: boolean
  virtual: boolean
  minimums: readonly number[]
  available: number | null
}): boolean {
  if (!options.wrap || options.virtual) {
    return false
  }
  return (
    options.available === null ||
    options.minimums.reduce((sum, width) => sum + width + CELL_PADDING_PX, 0) <= options.available
  )
}

/** Fixed column widths for a table that scrolls sideways. */
export function columnWidths(
  header: readonly string[],
  rows: readonly (readonly string[])[]
): number[] {
  return header.map((title, index) =>
    Math.min(
      320,
      Math.max(
        140,
        Math.max(
          title.length,
          ...rows.slice(0, SAMPLE_ROWS).map((row) => Math.min(40, row[index]?.length ?? 0))
        ) *
          7 +
          40
      )
    )
  )
}
