import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { childrenOf } from '../../shared/project-pages-tree'
import { createProjectPagesStore, ProjectPagesError } from './project-pages-store'

const USER = { kind: 'user' } as const
const AGENT = { kind: 'agent', agent: 'claude', worktreeId: 'wt-1' } as const
const SCOPE = 'repo:r1'

let root: string
let ids: number
let clock: number
const store = () =>
  createProjectPagesStore({ rootDir: root, now: () => ++clock, newId: () => `p_${++ids}` })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-'))
  ids = 0
  clock = 1000
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('stale user saves', () => {
  it('merges an edit made against an older revision with an agent append', () => {
    const pages = store()
    const doc = pages.createPage(SCOPE, { title: 'P', markdown: 'Intro.\n\nBody.\n' }, USER)
    pages.updatePage(
      SCOPE,
      doc.meta.id,
      { baseRevision: 1, markdown: 'Intro.\n\nBody.\n\nAgent.\n' },
      AGENT
    )
    const saved = pages.updatePage(
      SCOPE,
      doc.meta.id,
      { baseRevision: 1, markdown: 'Intro, edited.\n\nBody.\n', merge: true },
      USER
    )
    expect(saved.merged).toBe(true)
    expect(saved.markdown).toBe('Intro, edited.\n\nBody.\n\nAgent.\n')
    expect(saved.meta.revision).toBe(3)
  })

  it('still refuses a stale save that collides, or one that did not ask to merge', () => {
    const pages = store()
    const doc = pages.createPage(SCOPE, { title: 'P', markdown: 'Body.\n' }, USER)
    pages.updatePage(SCOPE, doc.meta.id, { baseRevision: 1, title: 'Renamed' }, AGENT)
    pages.updatePage(SCOPE, doc.meta.id, { baseRevision: 2, markdown: 'Agent body.\n' }, AGENT)
    const mine = { baseRevision: 1, markdown: 'My body.\n' }
    expect(code(() => pages.updatePage(SCOPE, doc.meta.id, { ...mine, merge: true }, USER))).toBe(
      'conflict'
    )
    expect(code(() => pages.updatePage(SCOPE, doc.meta.id, mine, USER))).toBe('conflict')
    expect(pages.listRevisions(SCOPE, doc.meta.id).map((r) => r.revision)).toEqual([2])
  })
})

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    return error instanceof ProjectPagesError ? error.code : 'other'
  }
  return undefined
}

describe('project pages store', () => {
  it('creates nested pages in order and reads them back after a reload', () => {
    const s = store()
    const a = s.createPage(SCOPE, { title: ' Launch\nplan ', markdown: '# Hi' }, USER)
    s.createPage(SCOPE, { title: 'Second' }, USER)
    s.createPage(SCOPE, { parentId: a.meta.id, title: 'Child' }, AGENT)
    const pages = store().listPages(SCOPE).pages
    expect(childrenOf(pages, null).map((p) => p.title)).toEqual(['Launch plan', 'Second'])
    expect(childrenOf(pages, a.meta.id)[0].editedBy).toEqual(AGENT)
    expect(store().readPage(SCOPE, a.meta.id).markdown).toBe('# Hi')
  })

  it('keeps spaces apart and lists nothing for an unknown scope', () => {
    const s = store()
    s.createPage(SCOPE, { title: 'Mine' }, USER)
    expect(s.listPages('repo:other').pages).toEqual([])
    expect(readdirSync(root)).toHaveLength(2)
  })

  it('bumps the revision, keeps history and refuses a stale base revision', () => {
    const s = store()
    const page = s.createPage(SCOPE, { markdown: 'one' }, USER)
    const next = s.updatePage(SCOPE, page.meta.id, { baseRevision: 1, markdown: 'two' }, AGENT)
    expect(next.meta.revision).toBe(2)
    expect(s.readRevision(SCOPE, page.meta.id, 1)).toBe('one')
    expect(
      code(() => s.updatePage(SCOPE, page.meta.id, { baseRevision: 1, markdown: 'x' }, USER))
    ).toBe('conflict')
  })

  it('does not bump the revision for an edit that changes nothing', () => {
    const s = store()
    const page = s.createPage(SCOPE, { title: 'Same', markdown: 'a' }, USER)
    const same = s.updatePage(
      SCOPE,
      page.meta.id,
      { baseRevision: 1, title: 'Same', markdown: 'a' },
      USER
    )
    expect(same.meta.revision).toBe(1)
  })

  it('prunes history to the newest twenty revisions', () => {
    const s = store()
    const page = s.createPage(SCOPE, { markdown: '0' }, USER)
    for (let i = 1; i <= 25; i++) {
      s.updatePage(SCOPE, page.meta.id, { baseRevision: i, markdown: String(i) }, USER)
    }
    expect(s.readRevision(SCOPE, page.meta.id, 25)).toBe('24')
    expect(s.readRevision(SCOPE, page.meta.id, 5)).toBeNull()
  })

  it('moves pages, renumbers siblings and refuses a move inside itself', () => {
    const s = store()
    const a = s.createPage(SCOPE, { title: 'A' }, USER).meta
    const b = s.createPage(SCOPE, { title: 'B' }, USER).meta
    const c = s.createPage(SCOPE, { parentId: a.id, title: 'C' }, USER).meta
    s.movePage(SCOPE, b.id, { parentId: null, index: 0 }, USER)
    expect(childrenOf(s.listPages(SCOPE).pages, null).map((p) => p.title)).toEqual(['B', 'A'])
    expect(code(() => s.movePage(SCOPE, a.id, { parentId: c.id, index: 0 }, USER))).toBe('invalid')
  })

  it('archives a subtree and restores only what went with it', () => {
    const s = store()
    const a = s.createPage(SCOPE, { title: 'A' }, USER).meta
    const b = s.createPage(SCOPE, { parentId: a.id, title: 'B' }, USER).meta
    const c = s.createPage(SCOPE, { parentId: a.id, title: 'C' }, USER).meta
    s.archivePage(SCOPE, c.id, USER)
    s.archivePage(SCOPE, a.id, USER)
    s.restorePage(SCOPE, a.id, USER)
    const pages = s.listPages(SCOPE).pages
    expect(pages.find((p) => p.id === b.id)?.archivedAt).toBeNull()
    expect(pages.find((p) => p.id === c.id)?.archivedAt).not.toBeNull()
  })

  it('moves a restored page to the top level when its parent is still trashed', () => {
    const s = store()
    const a = s.createPage(SCOPE, { title: 'A' }, USER).meta
    const b = s.createPage(SCOPE, { parentId: a.id, title: 'B' }, USER).meta
    s.archivePage(SCOPE, a.id, USER)
    s.restorePage(SCOPE, b.id, USER)
    expect(s.listPages(SCOPE).pages.find((p) => p.id === b.id)).toMatchObject({
      parentId: null,
      archivedAt: null
    })
  })

  it('recovers a page file the tree lost', () => {
    const s = store()
    s.createPage(SCOPE, { title: 'Kept' }, USER)
    const spaceDir = join(root, readdirSync(root).find((name) => name.startsWith('s_'))!)
    mkdirSync(join(spaceDir, 'pages'), { recursive: true })
    writeFileSync(join(spaceDir, 'pages', 'p_lost.md'), 'orphan')
    const recovered = s.listPages(SCOPE).pages.find((p) => p.id === 'p_lost')
    expect(recovered?.title).toBe('Recovered page')
    expect(readFileSync(join(spaceDir, 'pages', 'p_lost.md'), 'utf-8')).toBe('orphan')
  })

  it('rejects unknown ids, oversize bodies and path-like ids', () => {
    const s = store()
    expect(code(() => s.readPage(SCOPE, '../etc'))).toBe('not_found')
    expect(code(() => s.createPage(SCOPE, { parentId: 'p_none' }, USER))).toBe('not_found')
    expect(code(() => s.createPage(SCOPE, { markdown: 'x'.repeat(200_001) }, USER))).toBe('invalid')
  })

  it('tells listeners who changed what', () => {
    const s = store()
    const seen: unknown[] = []
    s.onChanged((change) => seen.push(change))
    const page = s.createPage(SCOPE, {}, AGENT)
    expect(seen).toEqual([{ scopeKey: SCOPE, pageId: page.meta.id, revision: 1, author: AGENT }])
  })
})
