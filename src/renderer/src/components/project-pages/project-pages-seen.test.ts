// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectPageMeta } from '../../../../shared/project-pages-types'
import { isChangedByAgent, markPagesSeen, resetSeenPagesForTests } from './project-pages-seen'

function page(id: string, revision: number, agent: boolean, archivedAt: number | null = null) {
  return {
    id,
    revision,
    archivedAt,
    editedBy: agent ? { kind: 'agent' as const, agent: 'claude' } : { kind: 'user' as const }
  } satisfies Pick<ProjectPageMeta, 'id' | 'revision' | 'editedBy' | 'archivedAt'>
}

function seenFor(scope: string): Record<string, number> | undefined {
  return JSON.parse(localStorage.getItem('muster.projectPages.seenRevisions.v1') ?? '{}')[scope]
}

describe('project pages seen revisions', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSeenPagesForTests()
  })

  it('flags nothing before a project has a baseline', () => {
    expect(isChangedByAgent(undefined, page('a', 3, true))).toBe(false)
  })

  it('flags agent edits newer than the seen revision', () => {
    markPagesSeen('s', [page('a', 2, true)])
    const seen = seenFor('s')
    expect(isChangedByAgent(seen, page('a', 2, true))).toBe(false)
    expect(isChangedByAgent(seen, page('a', 3, true))).toBe(true)
    expect(isChangedByAgent(seen, page('b', 1, true))).toBe(true)
  })

  it('ignores user edits and trashed pages', () => {
    markPagesSeen('s', [page('a', 1, false)])
    const seen = seenFor('s')
    expect(isChangedByAgent(seen, page('a', 4, false))).toBe(false)
    expect(isChangedByAgent(seen, page('a', 4, true, 9))).toBe(false)
  })

  it('never lowers a seen revision', () => {
    markPagesSeen('s', [page('a', 5, true)])
    markPagesSeen('s', [page('a', 2, true)])
    expect(seenFor('s')).toEqual({ a: 5 })
  })
})
