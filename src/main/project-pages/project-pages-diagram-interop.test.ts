import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageLinkHref } from '../../shared/project-pages-plain-text'
import { canvasToDiagramXml, readCanvas } from './project-pages-canvas-import'
import { createProjectPagesDatabases } from './project-pages-database-store'
import { createProjectPagesDiagrams } from './project-pages-diagram-store'
import { readDiagramCells, readDrawioPages, writeDrawioFile } from './project-pages-drawio-file'
import { exportProjectPages } from './project-pages-export'
import { importProjectPageFiles, importProjectPages } from './project-pages-import'
import { createProjectPagesStore } from './project-pages-store'

const USER = { kind: 'user' } as const
const GEOMETRY = '<mxGeometry width="80" height="40" as="geometry"/>'
const shape = (label: string, link: string): string =>
  link
    ? `<UserObject label="${label}" link="${link}" id="a"><mxCell style="rounded=1;" vertex="1" parent="1">${GEOMETRY}</mxCell></UserObject>`
    : `<mxCell id="a" value="${label}" style="rounded=1;" vertex="1" parent="1">${GEOMETRY}</mxCell>`
const model = (label: string, link = ''): string =>
  `<mxGraphModel dx="800"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${shape(label, link)}</root></mxGraphModel>`
const compress = (xml: string): string =>
  deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64')
const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

let root: string
let src: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-interop-'))
  src = mkdtempSync(join(tmpdir(), 'pages-interop-src-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(src, { recursive: true, force: true })
})

function setup() {
  const store = createProjectPagesStore({ rootDir: root })
  const diagrams = createProjectPagesDiagrams({ rootDir: root, store })
  const databases = createProjectPagesDatabases({ rootDir: root, store })
  const target = { store, diagrams, scopeKey: 's', parentId: null, author: USER }
  const page = (title: string) => store.listPages('s').pages.find((p) => p.title === title)!
  return { store, diagrams, databases, target, page }
}

describe('draw.io files', () => {
  it('reads plain, compressed, bare and SVG-embedded diagrams', () => {
    const file = `<mxfile><diagram name="One">${model('A')}</diagram><diagram name="Two">${compress(model('B'))}</diagram></mxfile>`
    expect(readDrawioPages(file).map((p) => [p.name, readDiagramCells(p.xml)[2].value])).toEqual([
      ['One', 'A'],
      ['Two', 'B']
    ])
    expect(readDrawioPages(model('C'))).toHaveLength(1)
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" content="${escapeAttr(file)}"><g/></svg>`
    expect(readDrawioPages(svg).map((p) => p.name)).toEqual(['One', 'Two'])
    expect(readDrawioPages('<svg><rect/></svg>')).toEqual([])
    expect(readDrawioPages('<config/>')).toEqual([])
  })

  it('writes a document draw.io can read back', () => {
    const doc = writeDrawioFile([{ name: 'A & B', xml: model('A') }])
    expect(readDrawioPages(doc)).toEqual([{ name: 'A & B', xml: model('A') }])
  })
})

describe('Obsidian canvas', () => {
  it('turns cards, groups and edges into shapes and connectors', () => {
    const canvas = readCanvas(
      JSON.stringify({
        nodes: [
          {
            id: '1',
            type: 'text',
            text: '# Plan\n**ship** it',
            x: -100,
            y: -50,
            width: 200,
            height: 80,
            color: '4'
          },
          { id: 'g', type: 'group', label: 'Team', x: -120, y: -70, width: 600, height: 300 },
          { id: 'f', type: 'file', file: 'Notes/Idea.md', x: 200, y: 0, width: 160, height: 60 },
          {
            id: 'l',
            type: 'link',
            url: 'https://example.com',
            x: 200,
            y: 100,
            width: 160,
            height: 60
          }
        ],
        edges: [
          { id: 'e', fromNode: '1', toNode: 'f', fromSide: 'right', toSide: 'left', label: 'then' },
          { id: 'x', fromNode: '1', toNode: 'gone' }
        ]
      })
    )!
    const cells = readDiagramCells(
      canvasToDiagramXml(canvas, (file) => (file === 'Notes/Idea.md' ? 'muster-page://p1' : null))
    )
    expect(cells.map((c) => c.id)).toEqual(['0', '1', 'g', 'canvas-1', 'f', 'l', 'e'])
    expect(cells[3].value).toBe('Plan<br>ship it')
    expect(cells[3].style).toMatchObject({ fillColor: '#d5e8d4', strokeColor: '#82b366' })
    expect(cells[4].attrs).toEqual({ link: 'muster-page://p1' })
    expect(cells[6]).toMatchObject({ source: 'canvas-1', target: 'f', value: 'then' })
    expect(cells[6].style).toMatchObject({ exitX: '1', entryX: '0', endArrow: 'classic' })
    expect(readCanvas('not json')).toBeNull()
  })
})

describe('diagram import and export', () => {
  it('imports diagram files beside markdown, with links and extra pages', () => {
    const { store, diagrams, target, page } = setup()
    writeFileSync(join(src, 'Notes.md'), 'Plain notes')
    writeFileSync(join(src, 'Flow.md'), 'Old body')
    writeFileSync(
      join(src, 'Flow.drawio'),
      `<mxfile><diagram name="Main">${model('Spec', 'Notes.md')}</diagram><diagram name="Detail">${compress(model('Deep'))}</diagram></mxfile>`
    )
    writeFileSync(
      join(src, 'Board.canvas'),
      JSON.stringify({
        nodes: [{ id: 'n', type: 'file', file: 'Notes.md', x: 0, y: 0, width: 100, height: 40 }],
        edges: []
      })
    )
    writeFileSync(join(src, 'Broken.drawio'), 'not a diagram')
    writeFileSync(join(src, 'icon.svg'), '<svg/>')

    const result = importProjectPages({ ...target, sourceDir: src })
    expect(result.count).toBe(4)
    expect(result.skipped).toEqual(['Broken.drawio: no draw.io diagram inside'])
    const notes = page('Notes')
    const flow = diagrams.readDiagram('s', page('Flow').id)
    expect(flow.xml).toContain(`link="${pageLinkHref(notes.id)}"`)
    expect(store.readPage('s', flow.page.id).markdown).toContain(
      `[Spec](${pageLinkHref(notes.id)})`
    )
    expect(page('Detail').parentId).toBe(flow.page.id)
    expect(diagrams.readDiagram('s', page('Board').id).xml).toContain(pageLinkHref(notes.id))
  })

  it('imports picked files and reports ones it cannot use', () => {
    const { target, page, diagrams } = setup()
    writeFileSync(join(src, 'Map.drawio.svg'), `<svg content="${escapeAttr(model('X'))}"/>`)
    writeFileSync(join(src, 'list.txt'), 'x')
    const result = importProjectPageFiles({
      ...target,
      files: [join(src, 'Map.drawio.svg'), join(src, 'list.txt')]
    })
    expect(result).toEqual({ count: 1, skipped: ['list.txt: not a markdown or diagram file'] })
    expect(diagrams.readDiagram('s', page('Map').id).xml).toContain('value="X"')
  })

  it('exports a .drawio beside each diagram page and imports it back', () => {
    const { store, diagrams, databases, page } = setup()
    const notes = store.createPage('s', { title: 'Notes' }, USER).meta
    const flow = store.createPage('s', { title: 'Flow' }, USER).meta
    diagrams.enableDiagram('s', flow.id, USER)
    diagrams.saveDiagram(
      's',
      flow.id,
      { baseRevision: 1, xml: model('Spec', pageLinkHref(notes.id)), outline: 'Shapes:\n- Spec' },
      USER
    )
    const out = join(src, 'out')
    mkdirSync(out)
    exportProjectPages({ store, databases, diagrams, scopeKey: 's', targetDir: out })
    const drawio = readFileSync(join(out, 'Flow.drawio'), 'utf-8')
    expect(drawio).toContain('link="Notes.md"')
    expect(readFileSync(join(out, 'Flow.md'), 'utf-8')).toBe(
      '# Flow\n\n[Open diagram](Flow.drawio)\n\nShapes:\n- Spec\n'
    )
    expect(page('Flow').diagram).toBe(true)

    const again = setup()
    rmSync(root, { recursive: true, force: true })
    const { store: store2, diagrams: diagrams2 } = again
    importProjectPages({ ...again.target, sourceDir: out })
    const flow2 = store2.listPages('s').pages.find((p) => p.title === 'Flow')!
    const notes2 = store2.listPages('s').pages.find((p) => p.title === 'Notes')!
    expect(store2.listPages('s').pages).toHaveLength(2)
    expect(diagrams2.readDiagram('s', flow2.id).xml).toContain(`link="${pageLinkHref(notes2.id)}"`)
  })
})
