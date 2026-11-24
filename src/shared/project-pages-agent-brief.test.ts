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

  it('says when there are no pages', () => {
    expect(buildProjectPagesAgentBrief({ projectName: 'Empty', pages: [] })).toContain(
      'no pages yet'
    )
  })
})
