import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import { createProjectPagesDatabases } from './project-pages-database-store'
import { exportProjectPages } from './project-pages-export'
import { importProjectPages } from './project-pages-import'
import { createProjectPagesStore } from './project-pages-store'

const USER = { kind: 'user' } as const
let root: string
let out: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-store-'))
  out = mkdtempSync(join(tmpdir(), 'pages-out-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

function setup() {
  const store = createProjectPagesStore({ rootDir: root })
  return { store, databases: createProjectPagesDatabases({ rootDir: root, store }) }
}

describe('page export and import', () => {
  it('exports nested pages with relative links and row front matter', () => {
    const { store, databases } = setup()
    const plan = store.createPage('a', { title: 'Q3: plan' }, USER).meta
    const launch = store.createPage('a', { parentId: plan.id, title: 'Launch' }, USER).meta
    store.updatePage(
      'a',
      plan.id,
      { baseRevision: 1, markdown: `See [launch](${pageLinkHref(launch.id)})` },
      USER
    )
    const tasks = store.createPage('a', { title: 'Tasks' }, USER).meta
    databases.enableDatabase('a', tasks.id, USER)
    databases.addRow('a', tasks.id, { title: 'Docs', properties: { Status: 'Done' } }, USER)

    expect(exportProjectPages({ store, databases, scopeKey: 'a', targetDir: out }).count).toBe(4)
    expect(readFileSync(join(out, 'Q3- plan.md'), 'utf-8')).toBe(
      '# Q3: plan\n\nSee [launch](Q3-%20plan/Launch.md)'
    )
    expect(readFileSync(join(out, 'Tasks', 'Docs.md'), 'utf-8')).toContain('"Status": "Done"')
  })

  it('imports a folder tree and turns relative links into page links', () => {
    const { store } = setup()
    mkdirSync(join(out, 'Guide 0123456789abcdef0123456789abcdef'))
    writeFileSync(
      join(out, 'Guide 0123456789abcdef0123456789abcdef.md'),
      '# Guide\n\nRead [setup](Guide%200123456789abcdef0123456789abcdef/Setup.md) and [site](https://x.y)'
    )
    writeFileSync(
      join(out, 'Guide 0123456789abcdef0123456789abcdef', 'Setup.md'),
      '---\na: 1\n---\nSteps'
    )
    mkdirSync(join(out, 'Loose', '.git'), { recursive: true })
    writeFileSync(join(out, 'Loose', 'Note.md'), 'Hi')
    writeFileSync(join(out, 'Loose', '.git', 'x.md'), 'skip')

    expect(
      importProjectPages({ store, scopeKey: 'b', sourceDir: out, parentId: null, author: USER })
        .count
    ).toBe(4)
    const pages = store.listPages('b').pages
    const byTitle = new Map(pages.map((p) => [p.title, p]))
    expect([...byTitle.keys()].sort()).toEqual(['Guide', 'Loose', 'Note', 'Setup'])
    expect(byTitle.get('Setup')?.parentId).toBe(byTitle.get('Guide')?.id)
    expect(store.readPage('b', byTitle.get('Guide')!.id).markdown).toBe(
      `Read [setup](${pageLinkHref(byTitle.get('Setup')!.id)}) and [site](https://x.y)`
    )
    expect(store.readPage('b', byTitle.get('Setup')!.id).markdown).toBe('Steps')
  })
})
