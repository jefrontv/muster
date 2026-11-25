// Agent ops over how pages connect: a page's related pages and the project's tags.
import type { ProjectPageMeta } from '../../shared/project-pages-types'
import { findWikiLinkPage } from '../../shared/project-pages-wiki-link-target'
import { listPageTags, relatedPages } from './project-pages-graph'
import type { ProjectPagesSearchIndex, ProjectPagesSnapshot } from './project-pages-search-index'
import { pagePath } from './project-pages-tool-target'

export const PROJECT_PAGES_LINK_OPS = ['related', 'tags'] as const
type LinkOp = (typeof PROJECT_PAGES_LINK_OPS)[number]

export function isProjectPagesLinkOp(op: string): op is LinkOp {
  return PROJECT_PAGES_LINK_OPS.includes(op as LinkOp)
}

/** What read_page adds beside linked_from: the live pages this one links to, its tags, and
 *  links that name no live page (not created yet, or in the Trash). */
export function pageConnections(
  search: ProjectPagesSearchIndex,
  scopeKey: string,
  id: string,
  all: readonly ProjectPageMeta[]
): { links_to: { id: string; path: string }[]; tags: string[]; unresolved_links?: string[] } {
  const entry = search.snapshot(scopeKey).entries.get(id)
  const isLive = (target: string): boolean =>
    all.some((p) => p.id === target && p.archivedAt === null)
  const unresolved = [
    ...(entry?.wikiRefs ?? []).filter((ref) => !findWikiLinkPage(all, ref)),
    ...(entry?.pageLinks ?? [])
      .filter((target) => !isLive(target))
      .map((target) => all.find((p) => p.id === target)?.title || target)
  ]
  return {
    links_to: (entry?.links ?? [])
      .filter(isLive)
      .map((target) => ({ id: target, path: pagePath(all, target) })),
    tags: (entry?.tags ?? []).map((tag) => tag.label),
    ...(unresolved.length > 0 ? { unresolved_links: unresolved } : {})
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
