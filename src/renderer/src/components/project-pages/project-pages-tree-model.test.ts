import { describe, expect, it } from 'vitest'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { ancestorIds, buildPageTree, trashedPages } from './project-pages-tree-model'

function page(
  id: string,
  parentId: string | null,
  title: string,
  archivedAt: number | null = null
): ProjectPageMeta {
  return {
    id,
    parentId,
    order: 0,
    title,
    icon: null,
    revision: 1,
    editedBy: { kind: 'user' },
    createdAt: id.charCodeAt(0),
    updatedAt: 0,
    archivedAt
  }
}

describe('project pages tree model', () => {
  const pages = [
    page('a', null, 'Launch'),
    page('b', 'a', 'Checklist'),
    page('c', null, 'Ideas'),
    page('d', 'c', 'Old', 5)
  ]

  it('nests live pages and hides trashed ones', () => {
    const tree = buildPageTree(pages)
    expect(tree.map((n) => n.page.id)).toEqual(['a', 'c'])
    expect(tree[0].children.map((n) => n.page.id)).toEqual(['b'])
    expect(tree[1].children).toEqual([])
  })

  it('keeps ancestors of a filter match', () => {
    expect(
      buildPageTree(pages, 'check').map((n) => [n.page.id, n.children.map((c) => c.page.id)])
    ).toEqual([['a', ['b']]])
  })

  it('lists the folders above a page, nearest first', () => {
    const nested = [...pages, page('e', 'b', 'Step')]
    expect(ancestorIds(nested, 'e')).toEqual(['b', 'a'])
    expect(ancestorIds(nested, 'a')).toEqual([])
    expect(ancestorIds([page('x', 'y', 'X'), page('y', 'x', 'Y')], 'x')).toEqual(['y'])
  })

  it('lists only the pages that were trashed directly', () => {
    const withSubtree = [...pages, page('e', 'd', 'Older', 5), page('f', null, 'Gone', 9)]
    expect(trashedPages(withSubtree).map((p) => p.id)).toEqual(['f', 'd'])
  })
})
