import { describe, expect, it } from 'vitest'
import { buildWorktreeTreeBranches } from './worktree-list-tree-branches'
import type { RenderRow } from './worktree-list-virtual-rows'

const header = (key: string): RenderRow => ({ type: 'header', key }) as unknown as RenderRow
const item = (rowKey: string): RenderRow => ({ type: 'item', rowKey }) as unknown as RenderRow
const lineage = (rowKey: string): RenderRow =>
  ({ type: 'lineage-group', key: `lineage:${rowKey}`, rows: [{ rowKey }] }) as unknown as RenderRow

describe('buildWorktreeTreeBranches', () => {
  it('marks first, middle and last cards under each header', () => {
    const branches = buildWorktreeTreeBranches([
      header('a'),
      item('a1'),
      lineage('a2'),
      item('a3'),
      header('b'),
      item('b1')
    ])
    expect(Object.fromEntries(branches)).toEqual({
      a1: 'first',
      a2: 'middle',
      a3: 'last',
      b1: 'only'
    })
  })

  it('leaves headers and headers without cards unmarked', () => {
    const branches = buildWorktreeTreeBranches([header('a'), header('b'), item('b1'), item('b2')])
    expect([...branches.keys()]).toEqual(['b1', 'b2'])
    expect(branches.get('b2')).toBe('last')
  })
})
