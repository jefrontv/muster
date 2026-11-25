import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import { createProjectPagesDiagrams } from './project-pages-diagram-store'
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

  it('ignores links inside code', () => {
    const store = createProjectPagesStore({ rootDir: root })
    const index = createProjectPagesSearchIndex(store)
    const target = store.createPage(SCOPE, { title: 'Target' }, USER)
    const href = pageLinkHref(target.meta.id)
    const source = store.createPage(
      SCOPE,
      {
        title: 'Source',
        markdown: `\`[[Target]]\` \\[[Target]]\n\`\`\`\n[T](${href}) [[Ghost]]\n\`\`\``
      },
      USER
    )
    const entry = index.snapshot(SCOPE).entries.get(source.meta.id)
    expect([entry?.links, entry?.pageLinks, entry?.wikiRefs]).toEqual([[], [], []])
    expect(index.backlinks(SCOPE, target.meta.id)).toEqual([])
  })

  it('resolves a [[link]] written before its page exists, and follows rename and Trash', () => {
    const store = createProjectPagesStore({ rootDir: root })
    const index = createProjectPagesSearchIndex(store)
    const source = store.createPage(SCOPE, { title: 'Source', markdown: 'See [[Later]].' }, USER)
    const linksOf = (): string[] => index.snapshot(SCOPE).entries.get(source.meta.id)?.links ?? []
    expect(linksOf()).toEqual([])

    const later = store.createPage(SCOPE, { title: 'Later' }, USER)
    expect(linksOf()).toEqual([later.meta.id])
    expect(index.backlinks(SCOPE, later.meta.id).map((p) => p.id)).toEqual([source.meta.id])

    store.updatePage(SCOPE, later.meta.id, { baseRevision: 1, title: 'Renamed' }, USER)
    expect(linksOf()).toEqual([])
    const renamed = store.createPage(SCOPE, { title: 'Other' }, USER)
    store.updatePage(SCOPE, renamed.meta.id, { baseRevision: 1, title: 'Later' }, USER)
    expect(linksOf()).toEqual([renamed.meta.id])

    store.archivePage(SCOPE, renamed.meta.id, USER)
    expect(linksOf()).toEqual([])
    store.restorePage(SCOPE, renamed.meta.id, USER)
    expect(linksOf()).toEqual([renamed.meta.id])
  })
  it('re-reads a page that turns into a diagram without a new revision', () => {
    const store = createProjectPagesStore({ rootDir: root })
    const diagrams = createProjectPagesDiagrams({ rootDir: root, store })
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="s1" value="Billing service" vertex="1" parent="1"/></root></mxGraphModel>'
    const index = createProjectPagesSearchIndex(store, { diagramXml: () => xml })
    const { meta } = store.createPage(SCOPE, { title: 'Map', markdown: 'Billing notes' }, USER)
    expect(index.snapshot(SCOPE).entries.get(meta.id)?.shapes).toBeUndefined()
    const { page } = diagrams.enableDiagram(SCOPE, meta.id, USER)
    expect(page.revision).toBe(meta.revision)
    expect(index.snapshot(SCOPE).entries.get(meta.id)?.shapes).toEqual([
      expect.objectContaining({ shape: 's1', text: 'Billing service' })
    ])
  })
})
