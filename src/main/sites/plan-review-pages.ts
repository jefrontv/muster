// Saves a plan under review as a page in the "Plans" folder of the caller's project Pages, so the
// review happens on a real page and each round becomes a page revision.
import type { PlanAnnotationOpenInput, PlanReviewPageRef } from '../../shared/plan-annotation-types'
import { pagesScopeKeyForRepo } from '../../shared/project-pages-space-key'
import { childrenOf } from '../../shared/project-pages-tree'
import type { ProjectPageAuthor, ProjectPageMeta } from '../../shared/project-pages-types'
import type { GlobalSettings } from '../../shared/types'
import type { ProjectPagesStore } from '../project-pages/project-pages-store'
import { callerRepo, type PagesToolRepo } from '../project-pages/project-pages-tool-target'

export const PLAN_REVIEW_FOLDER_TITLE = 'Plans'

export type PlanReviewPagesDeps = {
  store: ProjectPagesStore
  repos: () => readonly PagesToolRepo[]
  settings: () => GlobalSettings | null | undefined
}

type Settings = Pick<
  GlobalSettings,
  'experimentalProjectPages' | 'planReviewsToPages' | 'planReviewInProjectTab'
>

/** The popup setting wins: a review shown full screen is not also filed in Pages. */
export function planReviewsSaveToPages(settings: Settings | null | undefined): boolean {
  return (
    settings?.experimentalProjectPages === true &&
    settings.planReviewsToPages !== false &&
    settings.planReviewInProjectTab !== false
  )
}

function livePages(store: ProjectPagesStore, scopeKey: string): ProjectPageMeta[] {
  return store.listPages(scopeKey).pages.filter((p) => p.archivedAt === null)
}

function sameTitle(page: ProjectPageMeta, title: string): boolean {
  return page.title.trim().toLowerCase() === title.trim().toLowerCase()
}

function writeContent(
  store: ProjectPagesStore,
  scopeKey: string,
  page: ProjectPageMeta,
  content: string,
  author: ProjectPageAuthor
): void {
  store.updatePage(scopeKey, page.id, { baseRevision: page.revision, markdown: content }, author)
}

export function bindPlanReviewPage(
  deps: PlanReviewPagesDeps,
  input: PlanAnnotationOpenInput,
  prior: PlanReviewPageRef | null
): PlanReviewPageRef | null {
  const settings = deps.settings()
  if (input.page) {
    const exists = livePages(deps.store, input.page.scopeKey).some(
      (p) => p.id === input.page?.pageId
    )
    return settings?.experimentalProjectPages === true && exists ? input.page : null
  }
  if (!planReviewsSaveToPages(settings) || !input.cwd) {
    return null
  }
  const repo = callerRepo(deps.repos(), {
    cwd: input.cwd,
    agent: input.agent ?? '',
    worktreeId: null,
    terminalHandle: null
  })
  if (!repo) {
    return null
  }
  const scopeKey = pagesScopeKeyForRepo(repo.id)
  const author: ProjectPageAuthor = { kind: 'agent', agent: input.agent ?? 'Agent' }
  const { store } = deps
  const pages = livePages(store, scopeKey)
  const bound = prior?.scopeKey === scopeKey ? pages.find((p) => p.id === prior.pageId) : undefined
  if (bound) {
    writeContent(store, scopeKey, bound, input.content, author)
    return { scopeKey, pageId: bound.id }
  }
  const folder =
    childrenOf(pages, null).find((p) => p.folder && sameTitle(p, PLAN_REVIEW_FOLDER_TITLE)) ??
    store.createPage(scopeKey, { title: PLAN_REVIEW_FOLDER_TITLE, folder: true }, author).meta
  // After a restart the round memo is gone; the title still finds the page.
  const existing = childrenOf(pages, folder.id).find((p) => !p.folder && sameTitle(p, input.title))
  if (existing) {
    writeContent(store, scopeKey, existing, input.content, author)
    return { scopeKey, pageId: existing.id }
  }
  const created = store.createPage(
    scopeKey,
    { parentId: folder.id, title: input.title, markdown: input.content },
    author
  )
  return { scopeKey, pageId: created.meta.id }
}
