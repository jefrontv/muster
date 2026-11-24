import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import { buildPagesGraph, listPageTags, relatedPages } from './project-pages-graph'
import { createProjectPagesSearchIndex } from './project-pages-search-index'
import { createProjectPagesStore } from './project-pages-store'

const USER = { kind: 'user' } as const
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-graph-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function setup() {
  const store = createProjectPagesStore({ rootDir: root })
  const brief = store.createPage('s', { title: 'Brief', markdown: '#client/acme kickoff' }, USER)
  const plan = store.createPage(
    's',
    { title: 'Plan', markdown: `From [Brief](${pageLinkHref(brief.meta.id)}) #client/acme #q3` },
    USER
  )
  const child = store.createPage('s', { parentId: plan.meta.id, title: 'Tasks' }, USER)
  const lone = store.createPage('s', { title: 'Lone' }, USER)
  const snapshot = createProjectPagesSearchIndex(store).snapshot('s')
  return { snapshot, brief: brief.meta, plan: plan.meta, child: child.meta, lone: lone.meta }
}

describe('page graph', () => {
  it('adds task nodes and relates pages that link the same task', () => {
    const store = createProjectPagesStore({ rootDir: root })
    const url = 'https://ac.example.com/projects/4/tasks/99'
    const one = store.createPage('s', { title: 'One', markdown: `[Fix the header](${url})` }, USER)
    const two = store.createPage('s', { title: 'Two', markdown: `See ${url}/ for detail` }, USER)
    store.createPage('s', { title: 'Three', markdown: 'https://ac.example.com/projects/4' }, USER)
    const snapshot = createProjectPagesSearchIndex(store).snapshot('s')
    const graph = buildPagesGraph(snapshot)
    expect(graph.nodes.filter((n) => n.kind === 'task')).toEqual([
      {
        id: 'task:ac.example.com/tasks/99',
        kind: 'task',
        label: 'Fix the header',
        href: url,
        degree: 2
      }
    ])
    const related = relatedPages(snapshot, one.meta.id)
    expect(related.map((r) => [r.page.id, r.reasons])).toEqual([
      [two.meta.id, ['shares task "Fix the header"']]
    ])
  })

  it('builds page and tag nodes with link, tag and child edges', () => {
    const { snapshot, brief, plan, child } = setup()
    const graph = buildPagesGraph(snapshot)
    expect(graph.nodes.filter((n) => n.kind === 'tag').map((n) => n.label)).toEqual([
      'client/acme',
      'q3'
    ])
    expect(graph.edges).toContainEqual({ source: plan.id, target: brief.id, kind: 'link' })
    expect(graph.edges).toContainEqual({ source: plan.id, target: child.id, kind: 'child' })
    expect(graph.edges.filter((e) => e.kind === 'tag')).toHaveLength(3)
    expect(graph.nodes.find((n) => n.id === brief.id)?.degree).toBe(1)
  })

  it('ranks related pages by links, shared tags and family', () => {
    const { snapshot, brief, plan, child } = setup()
    const related = relatedPages(snapshot, plan.id)
    expect(related.map((r) => r.page.id)).toEqual([brief.id, child.id])
    expect(related[0].reasons).toEqual(['linked from this page', 'shares #client/acme'])
    expect(listPageTags(snapshot)).toEqual([
      { tag: 'client/acme', pages: 2 },
      { tag: 'q3', pages: 1 }
    ])
  })
})
