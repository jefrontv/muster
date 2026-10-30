// Cases adapted from the muster-bots fork (src/lib/table-data.test.ts), Apache-2.0.

import { describe, expect, it } from 'vitest'
import { fitsColumns, nextTableSort, tableCsv, tableRowOrder } from './chat-table-data'

describe('tableRowOrder', () => {
  const rows = [
    ['A', '10'],
    ['B', '2'],
    ['C', ''],
    ['D', '-1'],
    ['E', '2']
  ]

  it('sorts numerically and keeps empty cells last both ways', () => {
    expect(tableRowOrder(rows, '', { column: 1, descending: false })).toEqual([3, 1, 4, 0, 2])
    expect(tableRowOrder(rows, '', { column: 1, descending: true })).toEqual([0, 1, 4, 3, 2])
  })

  it('filters on any cell and keeps source order unsorted', () => {
    expect(tableRowOrder(rows, ' b ', null)).toEqual([1])
    expect(tableRowOrder(rows, '', null)).toEqual([0, 1, 2, 3, 4])
  })

  it('sorts long integer IDs without losing precision', () => {
    expect(
      tableRowOrder([['9007199254740993'], ['9007199254740992']], '', {
        column: 0,
        descending: false
      })
    ).toEqual([1, 0])
  })

  it('sorts text with numbers in natural order', () => {
    expect(tableRowOrder([['item 10'], ['item 9']], '', { column: 0, descending: false })).toEqual([
      1, 0
    ])
  })
})

describe('nextTableSort', () => {
  it('cycles ascending, descending, then off', () => {
    const first = nextTableSort(null, 2)
    expect(first).toEqual({ column: 2, descending: false })
    const second = nextTableSort(first, 2)
    expect(second).toEqual({ column: 2, descending: true })
    expect(nextTableSort(second, 2)).toBeNull()
    expect(nextTableSort(second, 0)).toEqual({ column: 0, descending: false })
  })
})

describe('tableCsv', () => {
  it('quotes commas, quotes and newlines and escapes spreadsheet formulas', () => {
    expect(
      tableCsv(
        ['Name', 'Note'],
        [
          ['A,B', 'say "hi"'],
          ['line\nbreak', '=SUM(A1)']
        ]
      )
    ).toBe('Name,Note\r\n"A,B","say ""hi"""\r\n"line\nbreak","\'=SUM(A1)"')
  })

  it('leaves plain cells bare', () => {
    expect(tableCsv(['a'], [['1'], ['two']])).toBe('a\r\n1\r\ntwo')
  })
})

describe('fitsColumns', () => {
  it('fits when the narrowest widths fit, and never for a virtual or unwrapped table', () => {
    expect(fitsColumns({ wrap: true, virtual: false, minimums: [60, 60], available: 200 })).toBe(
      true
    )
    expect(fitsColumns({ wrap: true, virtual: false, minimums: [90, 90], available: 200 })).toBe(
      false
    )
    expect(fitsColumns({ wrap: true, virtual: true, minimums: [], available: null })).toBe(false)
    expect(fitsColumns({ wrap: false, virtual: false, minimums: [], available: null })).toBe(false)
  })
})
