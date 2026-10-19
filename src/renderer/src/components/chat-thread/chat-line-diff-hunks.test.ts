import { describe, expect, it } from 'vitest'
import { lineDiffHunks } from './chat-line-diff-hunks'

const numbered = (count: number): string =>
  `${Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n')}\n`

describe('lineDiffHunks', () => {
  it('returns no hunks for identical text', () => {
    expect(lineDiffHunks('a\nb\n', 'a\nb\n')).toEqual([])
  })

  it('keeps three lines of context around one change', () => {
    const before = numbered(20)
    const after = before.replace('line 10\n', 'line ten\n')
    expect(lineDiffHunks(before, after)).toEqual([
      {
        oldStart: 7,
        oldLines: 7,
        newStart: 7,
        newLines: 7,
        lines: [
          ' line 7',
          ' line 8',
          ' line 9',
          '-line 10',
          '+line ten',
          ' line 11',
          ' line 12',
          ' line 13'
        ]
      }
    ])
  })

  it('merges nearby changes and splits distant ones', () => {
    const before = numbered(40)
    const near = before.replace('line 5\n', 'five\n').replace('line 9\n', 'nine\n')
    expect(lineDiffHunks(before, near)).toHaveLength(1)
    const far = before.replace('line 5\n', 'five\n').replace('line 30\n', 'thirty\n')
    const hunks = lineDiffHunks(before, far)
    expect(hunks).toHaveLength(2)
    expect(hunks?.[1]).toMatchObject({ oldStart: 27, newStart: 27 })
  })

  it('diffs a new file as all additions and ignores CRLF endings', () => {
    expect(lineDiffHunks('', 'a\nb\n')).toEqual([
      { oldStart: 1, oldLines: 0, newStart: 1, newLines: 2, lines: ['+a', '+b'] }
    ])
    expect(lineDiffHunks('a\r\nb\r\n', 'a\nb\n')).toEqual([])
  })
})
