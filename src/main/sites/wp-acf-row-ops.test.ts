import { describe, expect, it } from 'vitest'
import { ACF_MAX_ROW_OPS, readAcfRowOps } from './wp-acf-row-ops'

describe('readAcfRowOps', () => {
  it('returns nothing when rows is omitted', () => {
    expect(readAcfRowOps({})).toEqual([])
  })

  it('keeps each of the five operations in its documented shape', () => {
    const rows = [
      { op: 'append', path: 'modules', layout: 'media', values: { section_id: 'hero' } },
      { op: 'insert', path: 'modules', index: 3, layout: 'text', values: { body: 'Hi' } },
      { op: 'delete', path: 'modules', index: 7 },
      { op: 'move', path: 'modules', index: 7, to: 2 },
      { op: 'duplicate', path: 'modules', index: 7 }
    ]
    expect(readAcfRowOps({ rows })).toEqual(rows)
  })

  it('reads a duplicate target and a string index', () => {
    expect(
      readAcfRowOps({ rows: [{ op: 'duplicate', path: 'modules', index: '7', to: '8' }] })
    ).toEqual([{ op: 'duplicate', path: 'modules', index: 7, to: 8 }])
  })

  it('refuses more than 40 operations', () => {
    const rows = Array.from({ length: ACF_MAX_ROW_OPS + 1 }, () => ({
      op: 'delete',
      path: 'modules',
      index: 0
    }))
    expect(() => readAcfRowOps({ rows })).toThrow(/at most 40/)
  })

  it.each([
    [{ op: 'reorder', path: 'modules', index: 1 }, /must be one of append/],
    [{ op: 'delete', path: 'modules.0', index: 1 }, /not one of its rows/],
    [{ op: 'delete', path: 'modules.*', index: 1 }, /wildcards are read-only/],
    [{ op: 'delete', path: 'modules' }, /index' is required by delete/],
    [{ op: 'move', path: 'modules', index: 1 }, /to' is required by move/],
    [{ op: 'append', path: 'modules', index: 1 }, /not used by append/],
    [{ op: 'delete', path: 'modules', index: 1, to: 2 }, /only used by move and duplicate/],
    [{ op: 'delete', path: 'modules', index: -1 }, /0-based row index/],
    [{ op: 'delete', path: 'modules', index: 1.5 }, /0-based row index/],
    [{ op: 'insert', path: 'modules', index: 'last' }, /0-based row index/],
    [
      { op: 'delete', path: 'modules', index: 1, layout: 'media' },
      /only used by append and insert/
    ],
    [
      { op: 'move', path: 'modules', index: 1, to: 2, values: {} },
      /only used by append and insert/
    ],
    [{ op: 'append', path: 'modules', values: ['body'] }, /keyed by sub-field name/],
    [{ op: 'append', path: 'modules', position: 2 }, /not a row operation field/],
    [{ op: 'append' }, /path' must be a non-empty path/]
  ])('refuses %j', (row, message) => {
    expect(() => readAcfRowOps({ rows: [row] })).toThrow(message)
  })

  it('names the offending operation by index', () => {
    expect(() =>
      readAcfRowOps({
        rows: [
          { op: 'delete', path: 'modules', index: 0 },
          { op: 'nope', path: 'modules' }
        ]
      })
    ).toThrow(/rows\[1\].op/)
  })

  it('refuses rows that is not an array', () => {
    expect(() => readAcfRowOps({ rows: { op: 'delete' } })).toThrow(/must be an array/)
    expect(() => readAcfRowOps({ rows: ['delete modules.7'] })).toThrow(/must be an object/)
  })
})
