import { describe, expect, it } from 'vitest'
import {
  computeSourceControlTreeSetPositions,
  findSourceControlTreeParentIndex,
  resolveSourceControlTreeNavigation,
  resolveSourceControlTreeTabStop,
  type SourceControlTreeNavRow
} from './source-control-tree-navigation'

// section(staged) > dir(src) > a.ts, b.ts ; section(unstaged, collapsed)
const rows: SourceControlTreeNavRow[] = [
  { id: 'section::staged', level: 1, expanded: true },
  { id: 'dir::src', level: 2, expanded: true },
  { id: 'a.ts', level: 3 },
  { id: 'b.ts', level: 3 },
  { id: 'section::unstaged', level: 1, expanded: false }
]

describe('resolveSourceControlTreeNavigation', () => {
  it('moves between visible rows and stops at the ends', () => {
    expect(resolveSourceControlTreeNavigation(rows, 'a.ts', 'next')).toEqual({
      type: 'focus',
      id: 'b.ts'
    })
    expect(resolveSourceControlTreeNavigation(rows, 'a.ts', 'previous')).toEqual({
      type: 'focus',
      id: 'dir::src'
    })
    expect(resolveSourceControlTreeNavigation(rows, 'section::staged', 'previous')).toBeNull()
    expect(resolveSourceControlTreeNavigation(rows, 'section::unstaged', 'next')).toBeNull()
  })

  it('jumps to the first and last rows', () => {
    expect(resolveSourceControlTreeNavigation(rows, 'b.ts', 'first')).toEqual({
      type: 'focus',
      id: 'section::staged'
    })
    expect(resolveSourceControlTreeNavigation(rows, 'a.ts', 'last')).toEqual({
      type: 'focus',
      id: 'section::unstaged'
    })
  })

  it('collapses an expanded row, otherwise moves to the parent', () => {
    expect(resolveSourceControlTreeNavigation(rows, 'dir::src', 'collapse')).toEqual({
      type: 'collapse',
      id: 'dir::src'
    })
    expect(resolveSourceControlTreeNavigation(rows, 'b.ts', 'collapse')).toEqual({
      type: 'focus',
      id: 'dir::src'
    })
    expect(resolveSourceControlTreeNavigation(rows, 'section::unstaged', 'collapse')).toBeNull()
  })

  it('expands a collapsed row, otherwise moves to the first child', () => {
    expect(resolveSourceControlTreeNavigation(rows, 'section::unstaged', 'expand')).toEqual({
      type: 'expand',
      id: 'section::unstaged'
    })
    expect(resolveSourceControlTreeNavigation(rows, 'section::staged', 'expand')).toEqual({
      type: 'focus',
      id: 'dir::src'
    })
    expect(resolveSourceControlTreeNavigation(rows, 'a.ts', 'expand')).toBeNull()
  })

  it('does not treat an expanded row with no children as having a first child', () => {
    const empty: SourceControlTreeNavRow[] = [
      { id: 'section::a', level: 1, expanded: true },
      { id: 'section::b', level: 1, expanded: true }
    ]
    expect(resolveSourceControlTreeNavigation(empty, 'section::a', 'expand')).toBeNull()
  })

  it('starts from the first row when the current row is gone', () => {
    expect(resolveSourceControlTreeNavigation(rows, 'missing', 'next')).toEqual({
      type: 'focus',
      id: 'section::staged'
    })
    expect(resolveSourceControlTreeNavigation([], 'a.ts', 'next')).toBeNull()
  })
})

describe('findSourceControlTreeParentIndex', () => {
  it('finds the nearest shallower row', () => {
    expect(findSourceControlTreeParentIndex(rows, 3)).toBe(1)
    expect(findSourceControlTreeParentIndex(rows, 1)).toBe(0)
    expect(findSourceControlTreeParentIndex(rows, 0)).toBe(-1)
  })
})

describe('resolveSourceControlTreeTabStop', () => {
  it('keeps a visible preferred row', () => {
    expect(resolveSourceControlTreeTabStop(rows, 'b.ts', 0)).toBe('b.ts')
  })

  it('falls back to the row now at the old index when the preferred row vanished', () => {
    expect(resolveSourceControlTreeTabStop(rows, 'gone.ts', 3)).toBe('b.ts')
    expect(resolveSourceControlTreeTabStop(rows, 'gone.ts', 99)).toBe('section::unstaged')
    expect(resolveSourceControlTreeTabStop(rows, null, 0)).toBe('section::staged')
    expect(resolveSourceControlTreeTabStop([], 'a.ts', 0)).toBeNull()
  })
})

describe('computeSourceControlTreeSetPositions', () => {
  it('numbers siblings per parent', () => {
    expect(computeSourceControlTreeSetPositions(rows)).toEqual([
      { posInSet: 1, setSize: 2 },
      { posInSet: 1, setSize: 1 },
      { posInSet: 1, setSize: 2 },
      { posInSet: 2, setSize: 2 },
      { posInSet: 2, setSize: 2 }
    ])
  })

  it('starts a fresh group under each parent', () => {
    const twoSections: SourceControlTreeNavRow[] = [
      { id: 's1', level: 1, expanded: true },
      { id: 'a', level: 2 },
      { id: 'b', level: 2 },
      { id: 's2', level: 1, expanded: true },
      { id: 'c', level: 2 }
    ]
    expect(computeSourceControlTreeSetPositions(twoSections).map((p) => p.setSize)).toEqual([
      2, 2, 2, 2, 1
    ])
  })
})
