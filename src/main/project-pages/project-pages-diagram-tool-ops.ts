// Agent diagram tools. The renderer's hidden diagram editor does the model work; this side resolves
// pages and links, and saves the result as the agent so it is one page revision.
import {
  DIAGRAM_AGENT_LAYOUTS,
  type DiagramAgentEdit,
  type DiagramEditResult,
  type DiagramRenderResult
} from '../../shared/project-pages-diagram-agent'
import { PAGE_LINK_SCHEME } from '../../shared/project-pages-plain-text'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import { TOOL_IMAGE_KEY } from '../../shared/tool-result-image'
import type { DiagramWorker } from './project-pages-diagram-relay'
import type { ProjectPagesDiagrams } from './project-pages-diagram-store'
import { ProjectPagesError } from './project-pages-store'
import { toolText, type ToolArgs } from './project-pages-tool-args'
import { resolvePageRef } from './project-pages-tool-target'

export const PROJECT_PAGES_DIAGRAM_OPS = [
  'diagram_shapes',
  'read_diagram',
  'edit_diagram',
  'render_diagram'
] as const
export type ProjectPagesDiagramOp = (typeof PROJECT_PAGES_DIAGRAM_OPS)[number]
export const PROJECT_PAGES_DIAGRAM_READ_OPS: readonly ProjectPagesDiagramOp[] = [
  'diagram_shapes',
  'read_diagram',
  'render_diagram'
]

export function isProjectPagesDiagramOp(op: string): op is ProjectPagesDiagramOp {
  return (PROJECT_PAGES_DIAGRAM_OPS as readonly string[]).includes(op)
}

export type DiagramOpContext = {
  diagrams?: ProjectPagesDiagrams
  worker?: DiagramWorker
  scopeKey: string
  author: ProjectPageAuthor
  project: { id: string; name: string }
  pages: () => ProjectPageMeta[]
  row: (meta: ProjectPageMeta) => Record<string, unknown>
  args: ToolArgs
}

const EDIT_KEYS = ['add', 'connect', 'update', 'move', 'remove'] as const

function list(args: ToolArgs, key: string): Record<string, unknown>[] | undefined {
  const value = args[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (!Array.isArray(value)) {
    throw new ProjectPagesError('invalid', `${key} must be a list.`)
  }
  return value as Record<string, unknown>[]
}

/** A link may be a URL or a page (id or title path); pages become Muster page links. */
function linkHref(pages: ProjectPageMeta[], link: unknown): unknown {
  if (typeof link !== 'string' || !link.trim()) {
    return link
  }
  if (/^https?:\/\//i.test(link) || link.startsWith(PAGE_LINK_SCHEME)) {
    return link
  }
  return `${PAGE_LINK_SCHEME}${resolvePageRef(pages, link).id}`
}

/** The edit described by tool arguments; create_page calls the shape list "shapes". */
export function diagramEditFromArgs(args: ToolArgs, pages: ProjectPageMeta[]): DiagramAgentEdit {
  const edit: Record<string, unknown> = {}
  for (const key of EDIT_KEYS) {
    const rows = list(args, key) ?? (key === 'add' ? list(args, 'shapes') : undefined)
    if (rows?.length) {
      edit[key] = key === 'remove' ? rows : rows.map((row) => withLink(row, pages))
    }
  }
  const layout = args.layout
  const kind = typeof layout === 'object' && layout ? (layout as { kind?: unknown }).kind : layout
  if (layout !== undefined && !DIAGRAM_AGENT_LAYOUTS.includes(kind as never)) {
    throw new ProjectPagesError(
      'invalid',
      `layout must be one of ${DIAGRAM_AGENT_LAYOUTS.join(', ')}.`
    )
  }
  if (layout !== undefined) {
    edit.layout = layout
  }
  const mermaid = toolText(args, 'mermaid')
  if (mermaid) {
    edit.mermaid = mermaid
  }
  return edit as DiagramAgentEdit
}

function withLink(row: unknown, pages: ProjectPageMeta[]): unknown {
  if (!row || typeof row !== 'object' || !('link' in row)) {
    return row
  }
  return { ...row, link: linkHref(pages, (row as { link: unknown }).link) }
}

const hasEdit = (edit: DiagramAgentEdit): boolean => Object.keys(edit).length > 0

function need<T>(value: T | undefined): T {
  if (!value) {
    throw new ProjectPagesError('error', 'This Muster build cannot edit diagrams for agents.')
  }
  return value
}

/** Runs the edit on the stored XML and saves it; one retry when the user saved in between. */
export async function saveDiagramEdit(
  ctx: DiagramOpContext,
  pageId: string,
  edit: DiagramAgentEdit
): Promise<Record<string, unknown>> {
  const diagrams = need(ctx.diagrams)
  const worker = need(ctx.worker)
  for (let attempt = 0; ; attempt++) {
    const current = diagrams.readDiagram(ctx.scopeKey, pageId)
    const result = (await worker({ kind: 'edit', xml: current.xml, edit })) as DiagramEditResult
    try {
      const saved = diagrams.saveDiagram(
        ctx.scopeKey,
        pageId,
        { baseRevision: current.page.revision, xml: result.xml, outline: result.outline },
        ctx.author
      )
      return {
        project: ctx.project,
        page: ctx.row(saved.page),
        created: result.created,
        shapes: result.shapes,
        connections: result.connections,
        ...(result.overlaps.length
          ? {
              overlaps: result.overlaps,
              hint: 'These shapes overlap. Move them, run a layout, or call render_diagram to look.'
            }
          : {})
      }
    } catch (error) {
      if (attempt > 0 || !(error instanceof ProjectPagesError) || error.code !== 'conflict') {
        throw error
      }
    }
  }
}

export async function runProjectPagesDiagramOp(
  op: ProjectPagesDiagramOp,
  ctx: DiagramOpContext
): Promise<unknown> {
  const worker = need(ctx.worker)
  if (op === 'diagram_shapes') {
    return worker({ kind: 'shapes' })
  }
  const diagrams = need(ctx.diagrams)
  const page = resolvePageRef(ctx.pages(), toolText(ctx.args, 'page', true))
  if (op === 'edit_diagram') {
    const edit = diagramEditFromArgs(ctx.args, ctx.pages())
    if (!hasEdit(edit)) {
      throw new ProjectPagesError(
        'invalid',
        'Nothing to change: pass add, connect, update, move, remove, layout or mermaid.'
      )
    }
    return saveDiagramEdit(ctx, page.id, edit)
  }
  const { xml, page: meta } = diagrams.readDiagram(ctx.scopeKey, page.id)
  if (op === 'read_diagram') {
    const rows = await worker({ kind: 'read', xml, detail: ctx.args.detail === true })
    return { project: ctx.project, page: ctx.row(meta), ...(rows as object) }
  }
  const scale = ctx.args.scale === 2 ? 2 : 1
  const shot = (await worker({ kind: 'render', xml, scale })) as DiagramRenderResult
  return {
    project: ctx.project,
    page: ctx.row(meta),
    width: shot.width,
    height: shot.height,
    ...(shot.empty
      ? { note: 'The diagram is empty.' }
      : { [TOOL_IMAGE_KEY]: { data: shot.png, mimeType: 'image/png' } })
  }
}

/** create_page with diagram: true. Shapes, connections, layout or Mermaid are drawn in the same call. */
export async function finishDiagramPage(
  ctx: DiagramOpContext,
  meta: ProjectPageMeta
): Promise<Record<string, unknown>> {
  const diagrams = need(ctx.diagrams)
  const enabled = diagrams.enableDiagram(ctx.scopeKey, meta.id, ctx.author)
  const edit = diagramEditFromArgs(ctx.args, ctx.pages())
  if (!hasEdit(edit)) {
    return { project: ctx.project, page: ctx.row(enabled.page) }
  }
  return saveDiagramEdit(ctx, meta.id, edit)
}
