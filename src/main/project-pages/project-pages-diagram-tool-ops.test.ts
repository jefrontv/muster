import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagramWorkRequest } from '../../shared/project-pages-diagram-agent'
import { createProjectPagesDiagrams } from './project-pages-diagram-store'
import {
  diagramEditFromArgs,
  finishDiagramPage,
  runProjectPagesDiagramOp,
  type DiagramOpContext
} from './project-pages-diagram-tool-ops'
import { createProjectPagesStore } from './project-pages-store'
import { pageRow } from './project-pages-tool-target'

const AGENT = { kind: 'agent', agent: 'probe', worktreeId: null, terminalHandle: null } as const
const SCOPE = 'repo:r1'
const XML =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel>'
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pages-diagram-ops-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function setup(args: Record<string, unknown>) {
  const store = createProjectPagesStore({ rootDir: root })
  const diagrams = createProjectPagesDiagrams({ rootDir: root, store })
  const notes = store.createPage(SCOPE, { title: 'Notes' }, AGENT).meta
  const flow = store.createPage(SCOPE, { title: 'Flow' }, AGENT).meta
  diagrams.enableDiagram(SCOPE, flow.id, AGENT)
  const worker = vi.fn(async (request: DiagramWorkRequest): Promise<unknown> => {
    if (request.kind === 'edit') {
      return {
        xml: XML,
        outline: 'Shapes:\n- A',
        created: { A: 'a' },
        shapes: 1,
        connections: 0,
        overlaps: []
      }
    }
    if (request.kind === 'render') {
      return { png: 'iVBOR', width: 10, height: 20, empty: false }
    }
    return { shapes: [], connections: [] }
  })
  const pages = () => store.listPages(SCOPE).pages
  const ctx: DiagramOpContext = {
    diagrams,
    worker,
    scopeKey: SCOPE,
    author: AGENT,
    project: { id: 'r1', name: 'Repo' },
    pages,
    row: (meta) => pageRow(pages(), meta),
    args
  }
  return { store, diagrams, worker, ctx, notes, flow }
}

describe('agent diagram ops', () => {
  it('turns page links into Muster links and leaves URLs alone', () => {
    const { ctx, notes } = setup({})
    const edit = diagramEditFromArgs(
      {
        shapes: [
          { label: 'Spec', link: 'Notes' },
          { label: 'Site', link: 'https://example.com' }
        ],
        update: [{ target: 'Spec', link: null }],
        layout: 'down'
      },
      ctx.pages()
    )
    expect(edit.add?.[0].link).toBe(`muster-page://${notes.id}`)
    expect(edit.add?.[1].link).toBe('https://example.com')
    expect(edit.update?.[0].link).toBeNull()
    expect(edit.layout).toBe('down')
    expect(() => diagramEditFromArgs({ layout: 'zigzag' }, ctx.pages())).toThrow('layout must be')
  })

  it('saves an edit as one agent revision and reports what it made', async () => {
    const { ctx, diagrams, flow, worker } = setup({ page: 'Flow', add: [{ label: 'A' }] })
    const before = diagrams.readDiagram(SCOPE, flow.id).page.revision
    const result = (await runProjectPagesDiagramOp('edit_diagram', ctx)) as Record<string, unknown>
    const after = diagrams.readDiagram(SCOPE, flow.id)
    expect(worker).toHaveBeenCalledWith(expect.objectContaining({ kind: 'edit' }))
    expect(after.xml).toBe(XML)
    expect(after.page.revision).toBe(before + 1)
    expect(after.page.editedBy).toMatchObject({ agent: 'probe' })
    expect(result).toMatchObject({ created: { A: 'a' }, shapes: 1 })
    expect(result).not.toHaveProperty('overlaps')
  })

  it('refuses an edit with nothing in it', async () => {
    const { ctx } = setup({ page: 'Flow' })
    await expect(runProjectPagesDiagramOp('edit_diagram', ctx)).rejects.toThrow('Nothing to change')
  })

  it('returns a render as an image payload', async () => {
    const { ctx } = setup({ page: 'Flow', scale: 2 })
    const shot = (await runProjectPagesDiagramOp('render_diagram', ctx)) as Record<string, unknown>
    expect(shot).toMatchObject({ width: 10, mcp_image: { data: 'iVBOR', mimeType: 'image/png' } })
  })

  it('makes a page a diagram and draws it in the same call', async () => {
    const { ctx, store, diagrams } = setup({ connect: [{ from: 'A', to: 'B' }] })
    const page = store.createPage(SCOPE, { title: 'New' }, AGENT).meta
    await finishDiagramPage(ctx, page)
    expect(diagrams.readDiagram(SCOPE, page.id).xml).toBe(XML)
  })
})
