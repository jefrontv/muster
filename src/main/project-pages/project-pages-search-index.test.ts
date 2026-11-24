import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import { createProjectPagesSearchIndex } from './project-pages-search-index'
import { createProjectPagesStore } from './project-pages-store'

const USER = { kind: 'user' } as const
const SCOPE = 'repo:r1'
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-search-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('project pages search index', () => {
  it('ranks title over heading over body and follows later edits', () => {
    const store = createProjectPagesStore({ rootDir: root })
    const index = createProjectPagesSearchIndex(store)
    const body = store.createPage(
      SCOPE,
      { title: 'Notes', markdown: 'We talk about **launch** here.' },
      USER
    )
    store.createPage(SCOPE, { title: 'Plan', markdown: '## Launch steps\n\nship' }, USER)
    store.createPage(SCOPE, { title: 'Launch', markdown: '' }, USER)
    expect(index.search(SCOPE, 'launch').map((hit) => hit.page.title)).toEqual([
      'Launch',
      'Plan',
      'Notes'
    ])
    expect(index.search(SCOPE, 'launch').at(-1)?.snippet).toContain('We talk about launch here.')
    store.updatePage(SCOPE, body.meta.id, { baseRevision: 1, markdown: 'nothing' }, USER)
    expect(index.search(SCOPE, 'launch')).toHaveLength(2)
  })

  it('lists live pages that link to a page', () => {
    const store = createProjectPagesStore({ rootDir: root })
    const index = createProjectPagesSearchIndex(store)
    const target = store.createPage(SCOPE, { title: 'Target' }, USER)
    const source = store.createPage(
      SCOPE,
      { title: 'Source', markdown: `See [Target](${pageLinkHref(target.meta.id)})` },
      USER
    )
    expect(index.backlinks(SCOPE, target.meta.id).map((p) => p.id)).toEqual([source.meta.id])
    store.archivePage(SCOPE, source.meta.id, USER)
    expect(index.backlinks(SCOPE, target.meta.id)).toEqual([])
  })
})
