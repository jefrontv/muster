import { describe, expect, it } from 'vitest'
import type { NativeChatDiffRow } from './native-chat-diff-rows'
import { countHunkChanges, diffRows, hunkFromEditStrings, wordDiff } from './native-chat-diff-rows'
import { editHunks } from './native-chat-edit-hunks'

const lines = (rows: NativeChatDiffRow[]) =>
  rows.flatMap((row) =>
    row.kind === 'line'
      ? [[row.type, row.oldNo, row.newNo, row.segments.map((s) => s.text).join('')]]
      : []
  )

describe('diffRows', () => {
  const hunk = {
    oldStart: 10,
    oldLines: 3,
    newStart: 10,
    newLines: 3,
    lines: [' keep', '-const a = 1', '+const a = 2', ' tail']
  }

  it('numbers context, removals and additions from the hunk offsets', () => {
    const rows = diffRows([hunk])
    expect(rows[0]).toMatchObject({ kind: 'hunk', header: '@@ -10,3 +10,3 @@' })
    expect(lines(rows)).toEqual([
      ['ctx', 10, 10, 'keep'],
      ['del', 11, null, 'const a = 1'],
      ['add', null, 11, 'const a = 2'],
      ['ctx', 12, 12, 'tail']
    ])
  })

  it('highlights only the changed words of a paired line', () => {
    const del = diffRows([hunk]).find((row) => row.kind === 'line' && row.type === 'del')
    expect(
      del?.kind === 'line' && del.segments.filter((s) => s.changed).map((s) => s.text)
    ).toEqual(['1'])
  })

  it('skips the header for a new file and drops "\\ No newline" markers', () => {
    const created = {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
      lines: ['+x', '\\ No newline at end of file']
    }
    const rows = diffRows([created])
    expect(rows).toHaveLength(1)
    expect(lines(rows)).toEqual([['add', null, 1, 'x']])
  })

  it('gives every row a unique key', () => {
    const rows = diffRows([hunk, { ...hunk, oldStart: 40, newStart: 40 }])
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})

describe('wordDiff', () => {
  it('marks whole lines changed past the token budget', () => {
    const long = 'a '.repeat(300)
    expect(wordDiff(long, `${long}b`).after).toEqual([{ text: `${long}b`, changed: true }])
  })
})

describe('hunkFromEditStrings / editHunks', () => {
  it('diffs a one-line change as one removal and one addition, not the whole snippet', () => {
    const hunk = hunkFromEditStrings('a\nb\nc', 'a\nB\nc')
    expect(hunk?.lines).toEqual([' a', '-b', '+B', ' c'])
    expect(countHunkChanges(hunk ? [hunk] : [])).toEqual({ additions: 1, deletions: 1 })
  })

  it('prefers the recorded structured patch, numbered', () => {
    const patch = [{ oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ['-x', '+y'] }]
    const result = editHunks(
      { type: 'tool-call', name: 'Edit', input: { old_string: 'q', new_string: 'r' } },
      { type: 'tool-result', output: '', detail: { patch } }
    )
    expect(result).toEqual({ hunks: patch, numbered: true, truncated: false })
  })

  it('falls back to the call strings, unnumbered, including MultiEdit edits', () => {
    const result = editHunks(
      {
        type: 'tool-call',
        name: 'MultiEdit',
        input: {
          edits: [
            { old_string: 'a', new_string: 'b' },
            { old_string: 'c', new_string: 'd' }
          ]
        }
      },
      undefined
    )
    expect(result?.numbered).toBe(false)
    expect(result?.hunks).toHaveLength(2)
  })

  it('is null for a call with nothing to show', () => {
    expect(editHunks({ type: 'tool-call', name: 'Edit', input: {} }, undefined)).toBeNull()
  })
})
