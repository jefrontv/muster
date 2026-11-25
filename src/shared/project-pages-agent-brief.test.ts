import { describe, expect, it } from 'vitest'
import { buildProjectPagesAgentBrief } from './project-pages-agent-brief'
import type { ProjectPageMeta } from './project-pages-types'

function page(id: string, title: string, parentId: string | null, order = 0): ProjectPageMeta {
  return {
    id,
    parentId,
    order,
    title,
    icon: null,
    revision: 1,
    editedBy: { kind: 'user' },
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null
  }
}

describe('buildProjectPagesAgentBrief', () => {
  it('lists live pages as a nested outline and names the open page', () => {
    const brief = buildProjectPagesAgentBrief({
      projectName: 'Acme',
      pages: [
        page('p_b', 'Roadmap', null, 1),
        page('p_a', 'Overview', null, 0),
        page('p_c', 'Q3', 'p_b'),
        { ...page('p_d', 'Old', null, 2), archivedAt: 5 }
      ],
      openPage: { id: 'p_c', title: 'Q3' }
    })
    expect(brief).toContain('"Acme"')
    expect(brief).toContain('"Q3" (id: p_c) open')
    expect(brief).toContain('- Overview (id: p_a)\n- Roadmap (id: p_b)\n  - Q3 (id: p_c)')
    expect(brief).not.toContain('Old')
  })

  it('says [[links]] resolve without re-saving', () => {
    const brief = buildProjectPagesAgentBrief({ projectName: 'Acme', pages: [] })
    expect(brief).toContain('Never re-save a page to fix links')
    expect(brief).toContain('unresolved_links')
  })

  it('points at list_pages parent, depth and compact when the outline is cut', () => {
    const many = Array.from({ length: 85 }, (_, i) => page(`p_${i}`, `Page ${i}`, null, i))
    const brief = buildProjectPagesAgentBrief({ projectName: 'Big', pages: many })
    expect(brief).toContain('(5 more pages; list_pages with parent and depth, or compact: true)')
  })

  it('says when there are no pages', () => {
    expect(buildProjectPagesAgentBrief({ projectName: 'Empty', pages: [] })).toContain(
      'no pages yet'
    )
  })
})
