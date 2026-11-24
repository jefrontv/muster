import { describe, expect, it } from 'vitest'
import type { ProjectPageMeta } from './project-pages-types'
import {
  ancestorsOf,
  childrenOf,
  placePage,
  subtreeIds,
  wouldCreateCycle
} from './project-pages-tree'

function page(id: string, parentId: string | null, order: number): ProjectPageMeta {
  return {
    id,
    parentId,
    order,
    title: id,
    icon: null,
    revision: 1,
    editedBy: { kind: 'user' },
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null
  }
}
const pages = [page('a', null, 0), page('b', null, 1), page('c', 'a', 0), page('d', 'c', 0)]

describe('project pages tree', () => {
  it('lists children in order and walks subtrees and ancestors', () => {
    expect(childrenOf(pages, null).map((p) => p.id)).toEqual(['a', 'b'])
    expect([...subtreeIds(pages, 'a')].sort()).toEqual(['a', 'c', 'd'])
    expect(ancestorsOf(pages, 'd').map((p) => p.id)).toEqual(['a', 'c', 'd'])
  })

  it('detects cycles and places a page at a clamped index', () => {
    expect(wouldCreateCycle(pages, 'a', 'd')).toBe(true)
    expect(wouldCreateCycle(pages, 'd', 'b')).toBe(false)
    const moved = placePage(pages, 'd', null, 99)
    expect(childrenOf(moved, null).map((p) => [p.id, p.order])).toEqual([
      ['a', 0],
      ['b', 1],
      ['d', 2]
    ])
  })

  it('survives a parent loop in corrupt data', () => {
    const loop = [page('x', 'y', 0), page('y', 'x', 0)]
    expect(ancestorsOf(loop, 'x').length).toBeLessThanOrEqual(3)
  })
})
