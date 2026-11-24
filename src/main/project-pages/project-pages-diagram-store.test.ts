import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectPagesDiagrams, EMPTY_DIAGRAM } from './project-pages-diagram-store'
import { createProjectPagesStore } from './project-pages-store'

const USER = { kind: 'user' } as const
const SCOPE = 'repo:r1'
const xml = (label: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="${label}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel>`
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-diagrams-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function setup() {
  const store = createProjectPagesStore({ rootDir: root })
  const diagrams = createProjectPagesDiagrams({ rootDir: root, store })
  const page = store.createPage(SCOPE, { title: 'Flow' }, USER).meta
  return { store, diagrams, page }
}

describe('diagram pages', () => {
  it('turns a page into an empty diagram', () => {
    const { diagrams, page } = setup()
    expect(() => diagrams.readDiagram(SCOPE, page.id)).toThrow('is not a diagram')
    const made = diagrams.enableDiagram(SCOPE, page.id, USER)
    expect(made.page.diagram).toBe(true)
    expect(made.xml).toBe(EMPTY_DIAGRAM)
  })

  it('saves XML with its outline as one revision and keeps the old XML', () => {
    const { store, diagrams, page } = setup()
    diagrams.enableDiagram(SCOPE, page.id, USER)
    const first = diagrams.saveDiagram(
      SCOPE,
      page.id,
      { baseRevision: 1, xml: xml('A'), outline: '- A' },
      USER
    )
    expect(first.page.revision).toBe(2)
    expect(store.readPage(SCOPE, page.id).markdown).toMatch(
      /^- A\n\n<!-- diagram [0-9a-f]{12} -->\n$/
    )
    // Same outline, moved shape: still a new revision because the hash changes.
    const moved = xml('A').replace('x="0"', 'x="40"')
    const second = diagrams.saveDiagram(
      SCOPE,
      page.id,
      { baseRevision: 2, xml: moved, outline: '- A' },
      USER
    )
    expect(second.page.revision).toBe(3)
    expect(diagrams.readDiagram(SCOPE, page.id).xml).toBe(moved)
    const history = readdirSync(
      join(root, readdirSync(root).find((d) => d.startsWith('s_'))!, 'diagrams', 'history', page.id)
    )
    expect(history.sort()).toEqual(['1.drawio', '2.drawio'])
  })

  it('refuses stale revisions and bad XML', () => {
    const { diagrams, page } = setup()
    diagrams.enableDiagram(SCOPE, page.id, USER)
    diagrams.saveDiagram(SCOPE, page.id, { baseRevision: 1, xml: xml('A'), outline: '' }, USER)
    expect(() =>
      diagrams.saveDiagram(SCOPE, page.id, { baseRevision: 1, xml: xml('B'), outline: '' }, USER)
    ).toThrow('changed since revision 1')
    expect(() =>
      diagrams.saveDiagram(SCOPE, page.id, { baseRevision: 2, xml: '<svg/>', outline: '' }, USER)
    ).toThrow('one mxGraphModel')
    expect(() =>
      diagrams.saveDiagram(
        SCOPE,
        page.id,
        { baseRevision: 2, xml: '<!DOCTYPE x><mxGraphModel></mxGraphModel>', outline: '' },
        USER
      )
    ).toThrow('one mxGraphModel')
  })
})
