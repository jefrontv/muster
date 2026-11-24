// Reads an annotate_plan request body from the site bridge into the queue's open input.
import type { PlanAnnotationOpenInput, PlanReviewPageRef } from '../../shared/plan-annotation-types'
import { isPagesScopeKey } from '../../shared/project-pages-space-key'

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function pageRef(value: unknown): PlanReviewPageRef | null {
  const raw = (value ?? {}) as Record<string, unknown>
  return isPagesScopeKey(raw.scopeKey) && typeof raw.pageId === 'string' && raw.pageId
    ? { scopeKey: raw.scopeKey, pageId: raw.pageId }
    : null
}

/** Round and previousContent are left to the queue: a caller is not the authority on them. */
export function planAnnotationOpenInput(
  body: Record<string, unknown>,
  content: string
): PlanAnnotationOpenInput {
  return {
    planPath: text(body.planPath),
    title: text(body.title) ?? 'Plan',
    content,
    agent: text(body.agent),
    project: text(body.project),
    cwd: text(body.cwd),
    page: pageRef(body.page)
  }
}
