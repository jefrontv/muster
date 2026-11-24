// The DOM drawn around ActiveCollab links on a page: a header and detail row for a link on its own
// line, a status dot for a link inside a sentence.
import type { ActiveCollabPageRef } from '../../../../shared/project-pages-activecollab-links'
import type { ActiveCollabProject, ActiveCollabTask } from '../../../../shared/activecollab-types'
import type { Loaded } from './project-pages-activecollab-data'

export const AC_REF_ATTR = 'data-ac-ref'
// Lucide SquareCheckBig and FolderKanban.
const TASK_ICON = [
  'M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344',
  'm9 11 3 3L22 4'
]
const PROJECT_ICON = [
  'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
  'M8 10v4',
  'M12 10v2',
  'M16 10v6'
]

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) {
    node.textContent = text
  }
  return node
}

function icon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  return svg
}

function day(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function widget(ref: ActiveCollabPageRef, className: string): HTMLElement {
  const root = el('span', className)
  root.contentEditable = 'false'
  root.setAttribute(AC_REF_ATTR, JSON.stringify(ref))
  return root
}

/** The row above the link: what it is and where it lives. */
export function cardHead(
  ref: ActiveCollabPageRef,
  row: Loaded<ActiveCollabTask | ActiveCollabProject>
): HTMLElement {
  const head = widget(ref, 'page-ac-head')
  head.append(icon(ref.kind === 'task' ? TASK_ICON : PROJECT_ICON))
  if (row === undefined) {
    head.append('Loading from ActiveCollab')
  } else if (ref.kind === 'task' && row && 'projectName' in row) {
    head.append(`${row.projectName} · #${row.taskNumber}`)
  } else {
    head.append(ref.kind === 'task' ? 'ActiveCollab task' : 'ActiveCollab project')
  }
  return head
}

/** The row under the link: status, owner, due date and labels. */
export function cardMeta(
  ref: ActiveCollabPageRef,
  row: Loaded<ActiveCollabTask | ActiveCollabProject>
): HTMLElement {
  const meta = widget(ref, 'page-ac-meta')
  if (row === undefined) {
    return meta
  }
  if (row === null) {
    meta.append(el('span', 'page-ac-status is-missing', 'Closed or not visible'))
    return meta
  }
  if (!('projectName' in row)) {
    const open = row.openTaskCount
    meta.append(
      el(
        'span',
        `page-ac-status ${row.isCompleted ? 'is-done' : 'is-open'}`,
        row.isCompleted ? 'Completed' : 'Active'
      )
    )
    if (open !== null) {
      meta.append(el('span', 'page-ac-detail', `${open} open ${open === 1 ? 'task' : 'tasks'}`))
    }
    return meta
  }
  meta.append(
    el(
      'span',
      `page-ac-status ${row.isCompleted ? 'is-done' : 'is-open'}`,
      row.isCompleted ? 'Done' : 'Open'
    )
  )
  if (row.assigneeName) {
    meta.append(el('span', 'page-ac-detail', row.assigneeName))
  }
  if (row.dueOn !== null) {
    const late = !row.isCompleted && row.dueOn < Date.now() - 86_400_000
    meta.append(el('span', `page-ac-detail${late ? ' is-late' : ''}`, `Due ${day(row.dueOn)}`))
  }
  for (const label of row.labels.slice(0, 3)) {
    const chip = el('span', 'page-ac-label', label.name)
    if (label.color) {
      chip.style.setProperty('--label', label.color)
    }
    meta.append(chip)
  }
  return meta
}

/** The dot before a task link inside a sentence. */
export function chipDot(
  ref: ActiveCollabPageRef,
  row: Loaded<ActiveCollabTask | ActiveCollabProject>
): HTMLElement {
  const state =
    row === undefined ? 'is-loading' : !row ? 'is-missing' : row.isCompleted ? 'is-done' : 'is-open'
  return widget(ref, `page-ac-dot ${state}`)
}
