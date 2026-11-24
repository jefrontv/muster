// Reads a Pages page as the plan for annotate_plan's `page` argument.
import type { PlanReviewPageRef } from '../../../shared/plan-annotation-types'
import { PROJECT_PAGE_LIMITS } from '../../../shared/project-pages-types'
import { pagesScopeKeyForRepo } from '../../../shared/project-pages-space-key'
import { SiteMcpToolError } from './site-mcp-arguments'
import type { SiteMcpContext } from './site-mcp-context'

type PageRead = {
  project?: { id?: unknown }
  page?: { id?: unknown }
  title?: unknown
  markdown?: unknown
}

export async function loadPagePlan(
  context: SiteMcpContext,
  ref: string
): Promise<{ title: string; content: string; page: PlanReviewPageRef }> {
  if (!context.projectPagesTool) {
    throw new SiteMcpToolError('This Muster build has no pages. Pass path or content instead.')
  }
  const read = (await context.projectPagesTool('read', {
    page: ref,
    max_chars: PROJECT_PAGE_LIMITS.markdown
  })) as PageRead
  const projectId = read.project?.id
  const pageId = read.page?.id
  const content = typeof read.markdown === 'string' ? read.markdown : ''
  if (typeof projectId !== 'string' || typeof pageId !== 'string') {
    throw new SiteMcpToolError(`Could not read page "${ref}".`)
  }
  if (!content.trim()) {
    throw new SiteMcpToolError('That page is empty. Write the plan into it first.')
  }
  return {
    title: typeof read.title === 'string' && read.title ? read.title : 'Plan',
    content,
    page: { scopeKey: pagesScopeKeyForRepo(projectId), pageId }
  }
}
