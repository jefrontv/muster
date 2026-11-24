// Agent ops over how pages connect: a page's related pages and the project's tags.
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { listPageTags, relatedPages } from './project-pages-graph'
import type { ProjectPagesSearchIndex, ProjectPagesSnapshot } from './project-pages-search-index'
import { pagePath } from './project-pages-tool-target'

export const PROJECT_PAGES_LINK_OPS = ['related', 'tags'] as const
type LinkOp = (typeof PROJECT_PAGES_LINK_OPS)[number]

export function isProjectPagesLinkOp(op: string): op is LinkOp {
  return PROJECT_PAGES_LINK_OPS.includes(op as LinkOp)
}

/** What read_page adds beside linked_from: the live pages this one links to, and its tags. */
export function pageConnections(
  search: ProjectPagesSearchIndex,
  scopeKey: string,
  id: string,
  all: readonly ProjectPageMeta[]
): { links_to: { id: string; path: string }[]; tags: string[] } {
  const entry = search.snapshot(scopeKey).entries.get(id)
  return {
    links_to: (entry?.links ?? [])
      .filter((target) => all.some((p) => p.id === target && p.archivedAt === null))
      .map((target) => ({ id: target, path: pagePath(all, target) })),
    tags: (entry?.tags ?? []).map((tag) => tag.label)
  }
}

export function runProjectPagesLinkOp(
  op: LinkOp,
  ctx: {
    snapshot: ProjectPagesSnapshot
    project: { id: string; name: string }
    pageId: () => string
    pagePath: (id: string) => string
  }
): unknown {
  if (op === 'tags') {
    const tags = listPageTags(ctx.snapshot)
    return { project: ctx.project, count: tags.length, tags }
  }
  const id = ctx.pageId()
  const related = relatedPages(ctx.snapshot, id).map((hit) => ({
    id: hit.page.id,
    path: ctx.pagePath(hit.page.id),
    why: hit.reasons.join('; ')
  }))
  return { project: ctx.project, page: ctx.pagePath(id), count: related.length, related }
}
