// Builds the page map and "related pages" from the search index's parsed links and tags.
import {
  tagNodeId,
  taskNodeId,
  type PagesGraph,
  type PagesGraphEdge,
  type PagesGraphNode
} from '../../shared/project-pages-graph-types'
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import type { ProjectPagesSnapshot } from './project-pages-search-index'

export function buildPagesGraph({ pages, entries }: ProjectPagesSnapshot): PagesGraph {
  const live = new Set(pages.map((page) => page.id))
  const edges: PagesGraphEdge[] = []
  const degree = new Map<string, number>()
  const bump = (id: string): void => {
    degree.set(id, (degree.get(id) ?? 0) + 1)
  }
  const tags = new Map<string, string>()
  const tasks = new Map<string, { label: string; href: string }>()
  for (const page of pages) {
    if (page.parentId && live.has(page.parentId)) {
      edges.push({ source: page.parentId, target: page.id, kind: 'child' })
    }
    const entry = entries.get(page.id)
    for (const target of entry?.links ?? []) {
      if (target !== page.id && live.has(target)) {
        edges.push({ source: page.id, target, kind: 'link' })
        bump(page.id)
        bump(target)
      }
    }
    for (const tag of entry?.tags ?? []) {
      tags.set(tag.key, tags.get(tag.key) ?? tag.label)
      edges.push({ source: page.id, target: tagNodeId(tag.key), kind: 'tag' })
      bump(tagNodeId(tag.key))
    }
    for (const task of entry?.tasks ?? []) {
      tasks.set(task.key, tasks.get(task.key) ?? { label: task.title, href: task.href })
      edges.push({ source: page.id, target: taskNodeId(task.key), kind: 'task' })
      bump(taskNodeId(task.key))
    }
  }
  const nodes: PagesGraphNode[] = pages.map((page) => ({
    id: page.id,
    kind: 'page',
    label: page.title.trim() || 'Untitled',
    icon: page.icon,
    parentId: page.parentId,
    degree: degree.get(page.id) ?? 0
  }))
  for (const [key, label] of tags) {
    nodes.push({ id: tagNodeId(key), kind: 'tag', label, degree: degree.get(tagNodeId(key)) ?? 0 })
  }
  for (const [key, task] of tasks) {
    const id = taskNodeId(key)
    nodes.push({ id, kind: 'task', ...task, degree: degree.get(id) ?? 0 })
  }
  return { nodes, edges }
}

export type RelatedPage = { page: ProjectPageMeta; score: number; reasons: string[] }

/** A page's neighbours: links both ways, shared tasks and tags, then parent and children. */
export function relatedPages(
  { pages, entries }: ProjectPagesSnapshot,
  pageId: string,
  limit = 15
): RelatedPage[] {
  const own = entries.get(pageId)
  const ownTags = new Map((own?.tags ?? []).map((tag) => [tag.key, tag.label]))
  const ownTasks = new Map((own?.tasks ?? []).map((task) => [task.key, task.title]))
  const self = pages.find((page) => page.id === pageId)
  const related = new Map<string, RelatedPage>()
  const add = (page: ProjectPageMeta, score: number, reason: string): void => {
    const hit = related.get(page.id) ?? { page, score: 0, reasons: [] }
    hit.score += score
    hit.reasons.push(reason)
    related.set(page.id, hit)
  }
  for (const page of pages) {
    if (page.id === pageId) {
      continue
    }
    const entry = entries.get(page.id)
    if (own?.links.includes(page.id)) {
      add(page, 3, 'linked from this page')
    }
    if (entry?.links.includes(pageId)) {
      add(page, 3, 'links to this page')
    }
    const sharedTasks = (entry?.tasks ?? []).filter((task) => ownTasks.has(task.key))
    if (sharedTasks.length > 0) {
      const names = sharedTasks.map((task) => `"${ownTasks.get(task.key)}"`).join(', ')
      add(page, 2 * sharedTasks.length, `shares task ${names}`)
    }
    const shared = (entry?.tags ?? []).filter((tag) => ownTags.has(tag.key))
    if (shared.length > 0) {
      add(page, shared.length, `shares ${shared.map((tag) => `#${tag.label}`).join(' ')}`)
    }
    if (self?.parentId === page.id) {
      add(page, 1, 'parent page')
    } else if (page.parentId === pageId) {
      add(page, 1, 'subpage')
    }
  }
  return [...related.values()]
    .sort((a, b) => b.score - a.score || b.page.updatedAt - a.page.updatedAt)
    .slice(0, limit)
}

/** Every tag in the space with how many pages use it, most used first. */
export function listPageTags({ pages, entries }: ProjectPagesSnapshot): {
  tag: string
  pages: number
}[] {
  const counts = new Map<string, { tag: string; pages: number }>()
  for (const page of pages) {
    for (const tag of entries.get(page.id)?.tags ?? []) {
      const row = counts.get(tag.key) ?? { tag: tag.label, pages: 0 }
      row.pages += 1
      counts.set(tag.key, row)
    }
  }
  return [...counts.values()].sort((a, b) => b.pages - a.pages || a.tag.localeCompare(b.tag))
}
