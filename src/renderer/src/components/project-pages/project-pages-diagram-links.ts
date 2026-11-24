// Shape links to pages and ActiveCollab tasks: stored as draw.io's UserObject "link", drawn as a
// clickable badge whose colour shows the task's live status.
import { CellOverlay, ImageBox, InternalEvent, Point, type Cell, type Graph } from '@maxgraph/core'
import {
  parseActiveCollabUrl,
  type ActiveCollabPageRef
} from '../../../../shared/project-pages-activecollab-links'
import { PAGE_LINK_SCHEME } from '../../../../shared/project-pages-plain-text'
import { activeCollabInstance, pageProject, pageTask } from './project-pages-activecollab-data'
import type { PagesCell } from './project-pages-diagram-model'
import { tokenColor } from './project-pages-diagram-styles'

export type DiagramLink =
  | { kind: 'page'; pageId: string; href: string }
  | { kind: 'activecollab'; ref: ActiveCollabPageRef; href: string }
  | { kind: 'url'; href: string }

export type LinkStatus = 'page' | 'open' | 'done' | 'late' | 'missing' | 'loading' | 'url'

export const pageHref = (pageId: string): string => `${PAGE_LINK_SCHEME}${pageId}`

export function readLink(href: string): DiagramLink {
  if (href.startsWith(PAGE_LINK_SCHEME)) {
    return { kind: 'page', pageId: href.slice(PAGE_LINK_SCHEME.length), href }
  }
  const instance = activeCollabInstance()
  const ref = instance ? parseActiveCollabUrl(href, instance) : null
  return ref ? { kind: 'activecollab', ref, href } : { kind: 'url', href }
}

export const cellLink = (cell: Cell): string | undefined => (cell as PagesCell).pagesAttrs?.link

export function linkStatus(link: DiagramLink): LinkStatus {
  if (link.kind !== 'activecollab') {
    return link.kind
  }
  const row = link.ref.kind === 'task' ? pageTask(link.ref) : pageProject(link.ref.projectId)
  if (row === undefined) {
    return 'loading'
  }
  if (!row) {
    return 'missing'
  }
  if (row.isCompleted) {
    return 'done'
  }
  const due = 'dueOn' in row ? row.dueOn : null
  return due !== null && due < Date.now() - 86_400_000 ? 'late' : 'open'
}

/** Swaps the cell's extra attributes; the model runs it again to undo, so it toggles. */
class AttrsChange {
  constructor(
    private cell: PagesCell,
    private attrs: Record<string, string> | undefined
  ) {}
  execute(): void {
    const previous = this.cell.pagesAttrs
    this.cell.pagesAttrs = this.attrs
    this.attrs = previous
  }
}

/** Sets or clears a shape's link as one undoable model change, which also triggers a save. */
export function setCellLink(graph: Graph, cell: Cell, href: string | null): void {
  const next = { ...(cell as PagesCell).pagesAttrs }
  if (href) {
    next.link = href
  } else {
    delete next.link
  }
  graph
    .getDataModel()
    .execute(new AttrsChange(cell as PagesCell, Object.keys(next).length ? next : undefined))
}

const COLOURS: Record<LinkStatus, [string, string]> = {
  page: ['--muted-foreground', '#737373'],
  url: ['--muted-foreground', '#737373'],
  loading: ['--muted-foreground', '#737373'],
  missing: ['--muted-foreground', '#737373'],
  open: ['--status-info', '#2563eb'],
  done: ['--status-success', '#15803d'],
  late: ['--status-danger', '#b91c1c']
}

function badge(status: LinkStatus): ImageBox {
  const fill = tokenColor(...COLOURS[status])
  const glyph =
    status === 'done'
      ? '<path d="M5 8.5l2 2 4-4.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M6.8 9.2l2.4-2.4M7.5 5.6l.8-.8a1.9 1.9 0 0 1 2.7 2.7l-.8.8M8.5 10.4l-.8.8a1.9 1.9 0 0 1-2.7-2.7l.8-.8" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7.5" fill="${fill}"/>${glyph}</svg>`
  return new ImageBox(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 16, 16)
}

const descendants = (cell: Cell): Cell[] =>
  cell.getChildren().flatMap((child) => [child, ...descendants(child)])

/** Redraws the link badges after any model change or ActiveCollab data load. */
export function syncLinkBadges(graph: Graph, open: (link: DiagramLink) => void): void {
  const root = graph.getDataModel().getRoot()
  if (!root) {
    return
  }
  for (const cell of descendants(root)) {
    graph.removeCellOverlays(cell)
    const href = cell.isVertex() ? cellLink(cell) : undefined
    if (!href) {
      continue
    }
    const link = readLink(href)
    const overlay = new CellOverlay(
      badge(linkStatus(link)),
      null,
      'right',
      'top',
      new Point(-4, 4),
      'pointer'
    )
    overlay.addListener(InternalEvent.CLICK, () => open(link))
    graph.addCellOverlay(cell, overlay)
  }
}
