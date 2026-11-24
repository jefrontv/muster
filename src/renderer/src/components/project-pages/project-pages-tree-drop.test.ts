import { describe, expect, it } from 'vitest'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { treeDropMove, treeDropZone } from './project-pages-tree-drop'

const page = (id: string, parentId: string | null, order: number): ProjectPageMeta =>
  ({ id, parentId, order, createdAt: 0, title: id, archivedAt: null }) as ProjectPageMeta

// a, b (with b1, b2), c at the top level.
const pages = [
  page('a', null, 0),
  page('b', null, 1),
  page('b1', 'b', 0),
  page('b2', 'b', 1),
  page('c', null, 2)
]

describe('tree drop', () => {
  it('splits a row into before, inside and after', () => {
    expect(treeDropZone(2, 28)).toBe('before')
    expect(treeDropZone(14, 28)).toBe('inside')
    expect(treeDropZone(26, 28)).toBe('after')
  })

  it('nests at the end of the target children', () => {
    expect(treeDropMove(pages, 'a', 'b', 'inside')).toEqual({ parentId: 'b', index: 2 })
  })

  it('reorders among siblings and across levels', () => {
    expect(treeDropMove(pages, 'c', 'a', 'before')).toEqual({ parentId: null, index: 0 })
    expect(treeDropMove(pages, 'a', 'c', 'after')).toEqual({ parentId: null, index: 2 })
    expect(treeDropMove(pages, 'c', 'b1', 'after')).toEqual({ parentId: 'b', index: 1 })
  })

  it('refuses drops into itself and drops that change nothing', () => {
    expect(treeDropMove(pages, 'b', 'b1', 'inside')).toBeNull()
    expect(treeDropMove(pages, 'b', 'b2', 'after')).toBeNull()
    expect(treeDropMove(pages, 'a', 'b', 'before')).toBeNull()
    expect(treeDropMove(pages, 'a', 'a', 'inside')).toBeNull()
  })
})
