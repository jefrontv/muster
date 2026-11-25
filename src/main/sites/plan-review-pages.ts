// Saves a plan under review as a Pages page ("Plans" folder unless the agent names one), so the
// review happens on a real page and each round becomes a page revision.
import type { PlanAnnotationOpenInput, PlanReviewPageRef } from '../../shared/plan-annotation-types'
import { planPageTitle, stripTitleHeading } from '../../shared/plan-page-heading'
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

/** force: the person chose "Add to Pages", so the save-every-review setting does not apply. */
export type PlanReviewBindOptions = { force?: boolean }

type Settings = Pick<
  GlobalSettings,
  'experimentalProjectPages' | 'planReviewsToPages' | 'planReviewInProjectTab'
>

/** Opt-in, and the popup setting wins: a review shown full screen is not also filed in Pages. */
export function planReviewsSaveToPages(settings: Settings | null | undefined): boolean {
  return (
    settings?.experimentalProjectPages === true &&
    settings.planReviewsToPages === true &&
    settings.planReviewInProjectTab !== false
  )
}

function livePages(store: ProjectPagesStore, scopeKey: string): ProjectPageMeta[] {
  return store.listPages(scopeKey).pages.filter((p) => p.archivedAt === null)
}

function sameTitle(page: ProjectPageMeta, title: string): boolean {
  return page.title.trim().toLowerCase() === title.trim().toLowerCase()
}

/** A folder id, or a slash path like "Specs/Q4" whose missing folders are created. */
function folderFor(
  store: ProjectPagesStore,
  scopeKey: string,
  pages: ProjectPageMeta[],
  ref: string | null | undefined,
  author: ProjectPageAuthor
): ProjectPageMeta {
  const byId = ref ? pages.find((p) => p.id === ref && p.folder) : undefined
  if (byId) {
    return byId
  }
  const parts = (ref ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  let parentId: string | null = null
  let folder: ProjectPageMeta | undefined
  for (const part of parts.length > 0 ? parts : [PLAN_REVIEW_FOLDER_TITLE]) {
    folder =
      childrenOf(pages, parentId).find((p) => p.folder && sameTitle(p, part)) ??
      store.createPage(scopeKey, { parentId, title: part, folder: true }, author).meta
    parentId = folder.id
  }
  return folder as ProjectPageMeta
}

export function bindPlanReviewPage(
  deps: PlanReviewPagesDeps,
  input: PlanAnnotationOpenInput,
  prior: PlanReviewPageRef | null,
  options: PlanReviewBindOptions = {}
): PlanReviewPageRef | null {
  const settings = deps.settings()
  if (input.page) {
    const exists = livePages(deps.store, input.page.scopeKey).some(
      (p) => p.id === input.page?.pageId
    )
    return settings?.experimentalProjectPages === true && exists ? input.page : null
  }
  const allowed = options.force
    ? settings?.experimentalProjectPages === true
    : planReviewsSaveToPages(settings)
  if (!allowed || !input.cwd) {
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
  const title = planPageTitle(input.title, input.content)
  const markdown = stripTitleHeading(input.content, title)
  const write = (page: ProjectPageMeta): PlanReviewPageRef => {
    store.updatePage(scopeKey, page.id, { baseRevision: page.revision, markdown }, author)
    return { scopeKey, pageId: page.id }
  }
  // Later rounds follow the page wherever it was first saved, even if someone moved it.
  const bound = prior?.scopeKey === scopeKey ? pages.find((p) => p.id === prior.pageId) : undefined
  if (bound) {
    return write(bound)
  }
  const folder = folderFor(store, scopeKey, pages, input.pagesFolder, author)
  // After a restart the round memo is gone; the title still finds the page.
  const existing = childrenOf(pages, folder.id).find((p) => !p.folder && sameTitle(p, title))
  if (existing) {
    return write(existing)
  }
  const created = store.createPage(scopeKey, { parentId: folder.id, title, markdown }, author)
  return { scopeKey, pageId: created.meta.id }
}
