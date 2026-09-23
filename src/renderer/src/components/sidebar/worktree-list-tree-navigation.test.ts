import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../../shared/types'
import type { Row } from './worktree-list-groups'
import type { HostHeaderRow } from './host-section-rows'
import type { RenderRow } from './worktree-list-virtual-rows'
import {
  buildWorktreeTreeNavItems,
  getWorktreeOptionId,
  getWorktreeTreeItemAria,
  resolveWorktreeTreeKeyAction
} from './worktree-list-tree-navigation'

type HeaderRow = Extract<Row, { type: 'header' }>
type ItemRow = Extract<Row, { type: 'item' }>

const header = (key: string, overrides: Partial<HeaderRow> = {}): HeaderRow => ({
  type: 'header',
  key,
  label: key,
  count: 2,
  tone: '',
  ...overrides
})

const item = (id: string, sectionKey: string, overrides: Partial<ItemRow> = {}): ItemRow => ({
  type: 'item',
  rowKey: `${sectionKey}:${id}`,
  sectionKey,
  worktree: { id } as Worktree,
  repo: undefined,
  depth: 0,
  groupDepth: 0,
  lineageTrail: [],
  isLastLineageChild: false,
  lineageChildCount: 0,
  ...overrides
})

const host = (hostId: string, collapsed = false): HostHeaderRow =>
  ({
    type: 'host-header',
    key: `host:${hostId}`,
    hostId,
    kind: 'ssh',
    label: hostId,
    detail: '',
    health: 'available',
    collapsed,
    count: 1
  }) as HostHeaderRow

describe('buildWorktreeTreeNavItems', () => {
  it('assigns levels, parents and sibling positions across headers and rows', () => {
    const rows: RenderRow[] = [
      header('repo:a'),
      item('a1', 'repo:a'),
      item('a2', 'repo:a'),
      header('repo:b'),
      item('b1', 'repo:b')
    ]
    const items = buildWorktreeTreeNavItems(rows, new Set())

    expect(items.map((entry) => [entry.kind, entry.level, entry.parentIndex])).toEqual([
      ['header', 1, null],
      ['worktree', 2, 0],
      ['worktree', 2, 0],
      ['header', 1, null],
      ['worktree', 2, 3]
    ])
    expect(getWorktreeTreeItemAria(items[0])).toEqual({
      'aria-level': 1,
      'aria-setsize': 2,
      'aria-posinset': 1,
      'aria-expanded': true
    })
    expect(getWorktreeTreeItemAria(items[2])).toEqual({
      'aria-level': 2,
      'aria-setsize': 2,
      'aria-posinset': 2
    })
    expect(items[1]?.optionId).toBe(getWorktreeOptionId('repo:a:a1'))
  })

  it('marks collapsed headers and nests project groups, hosts and lineage children', () => {
    const rows: RenderRow[] = [
      host('box'),
      header('group:g', { projectGroupDepth: 0 }),
      header('repo:r', { projectGroupDepth: 1 }),
      {
        type: 'lineage-group',
        key: 'lg',
        rows: [
          item('parent', 'repo:r', { lineageChildCount: 1, lineageGroupKey: 'lineage:parent' }),
          item('child', 'repo:r', { depth: 1 })
        ]
      },
      header('repo:closed', { projectGroupDepth: 1 })
    ]
    const items = buildWorktreeTreeNavItems(rows, new Set(['repo:closed']))

    expect(items.map((entry) => [entry.level, entry.parentIndex, entry.expanded])).toEqual([
      [1, null, true],
      [2, 0, true],
      [3, 1, true],
      [4, 2, true],
      [5, 3, undefined],
      [3, 1, false]
    ])
    expect(items[3]?.toggleKey).toBe('lineage:parent')
    expect(items[4]?.renderRowIndex).toBe(3)
  })

  it('treats empty headers as leaves', () => {
    const items = buildWorktreeTreeNavItems([header('pr:none', { count: 0 })], new Set())
    expect(items[0]?.expanded).toBeUndefined()
    expect(items[0]?.toggleKey).toBeUndefined()
  })
})

describe('resolveWorktreeTreeKeyAction', () => {
  const rows: RenderRow[] = [
    header('repo:a'),
    item('a1', 'repo:a'),
    header('repo:b'),
    item('b1', 'repo:b')
  ]
  const expanded = buildWorktreeTreeNavItems(rows, new Set())
  const collapsed = buildWorktreeTreeNavItems(
    [header('repo:a'), header('repo:b')],
    new Set(['repo:a'])
  )

  it('moves through headers and rows without wrapping', () => {
    expect(resolveWorktreeTreeKeyAction('ArrowDown', expanded, 1)).toEqual({
      type: 'focus',
      index: 2
    })
    expect(resolveWorktreeTreeKeyAction('ArrowUp', expanded, 2)).toEqual({
      type: 'focus',
      index: 1
    })
    expect(resolveWorktreeTreeKeyAction('ArrowDown', expanded, 3)).toEqual({
      type: 'focus',
      index: 3
    })
    expect(resolveWorktreeTreeKeyAction('ArrowUp', expanded, 0)).toEqual({
      type: 'focus',
      index: 0
    })
    expect(resolveWorktreeTreeKeyAction('ArrowDown', expanded, -1)).toEqual({
      type: 'focus',
      index: 0
    })
  })

  it('jumps with Home and End', () => {
    expect(resolveWorktreeTreeKeyAction('Home', expanded, 2)).toEqual({ type: 'focus', index: 0 })
    expect(resolveWorktreeTreeKeyAction('End', expanded, 0)).toEqual({ type: 'focus', index: 3 })
  })

  it('collapses an expanded header on Left and moves a row to its header', () => {
    expect(resolveWorktreeTreeKeyAction('ArrowLeft', expanded, 0)).toEqual({
      type: 'toggle',
      index: 0
    })
    expect(resolveWorktreeTreeKeyAction('ArrowLeft', expanded, 3)).toEqual({
      type: 'focus',
      index: 2
    })
    expect(resolveWorktreeTreeKeyAction('ArrowLeft', collapsed, 0)).toBeNull()
  })

  it('expands a collapsed header on Right and then enters its first child', () => {
    expect(resolveWorktreeTreeKeyAction('ArrowRight', collapsed, 0)).toEqual({
      type: 'toggle',
      index: 0
    })
    expect(resolveWorktreeTreeKeyAction('ArrowRight', expanded, 0)).toEqual({
      type: 'focus',
      index: 1
    })
    expect(resolveWorktreeTreeKeyAction('ArrowRight', expanded, 1)).toBeNull()
  })

  it('toggles headers and activates rows on Enter and Space', () => {
    expect(resolveWorktreeTreeKeyAction('Enter', expanded, 0)).toEqual({ type: 'toggle', index: 0 })
    expect(resolveWorktreeTreeKeyAction(' ', expanded, 2)).toEqual({ type: 'toggle', index: 2 })
    expect(resolveWorktreeTreeKeyAction('Enter', expanded, 1)).toEqual({
      type: 'activate',
      index: 1,
      key: 'Enter'
    })
    expect(resolveWorktreeTreeKeyAction(' ', expanded, 3)).toEqual({
      type: 'activate',
      index: 3,
      key: ' '
    })
    expect(resolveWorktreeTreeKeyAction('Enter', expanded, -1)).toBeNull()
  })

  it('ignores unrelated keys and empty lists', () => {
    expect(resolveWorktreeTreeKeyAction('a', expanded, 0)).toBeNull()
    expect(resolveWorktreeTreeKeyAction('ArrowDown', [], -1)).toBeNull()
  })
})
