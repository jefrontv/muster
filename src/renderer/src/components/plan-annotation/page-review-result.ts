// Turns a page-backed review into the annotate_plan verdict: this round's comment threads become
// notes, and the page's edits become a diff against the round's text.
import type {
  PlanAnnotation,
  PlanAnnotationDecision,
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../../../shared/plan-annotation-types'
import type { PageCommentThread } from '../../../../shared/project-pages-comment-types'
import { unifiedPlanDiff } from './plan-annotation-diff'

/** Blank-line and trailing-space noise the page editor adds when it saves untouched text. */
export function samePlanText(a: string, b: string): boolean {
  const norm = (text: string): string =>
    text
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  return norm(a) === norm(b)
}

/** 1-based lines of the quote in the plan; 0 when the rendered quote is not in the markdown. */
function linesOf(markdown: string, quote: string): { startLine: number; endLine: number } {
  const probe = [quote, quote.split('\n')[0], quote.slice(0, 24)].find(
    (candidate) => candidate.trim() && markdown.includes(candidate)
  )
  if (!probe) {
    return { startLine: 0, endLine: 0 }
  }
  const startLine = markdown.slice(0, markdown.indexOf(probe)).split('\n').length
  return { startLine, endLine: startLine + (quote.match(/\n/g)?.length ?? 0) }
}

/** Open threads with something the person wrote since the round opened, oldest first. */
export function roundThreads(
  threads: readonly PageCommentThread[],
  since: number
): PageCommentThread[] {
  return threads.filter(
    (thread) =>
      thread.status === 'open' &&
      thread.messages.some((m) => m.author.kind === 'user' && m.createdAt >= since)
  )
}

export function threadsToAnnotations(
  threads: readonly PageCommentThread[],
  since: number,
  markdown: string
): PlanAnnotation[] {
  return roundThreads(threads, since).map((thread) => {
    const fresh = thread.messages.filter((m) => m.author.kind === 'user' && m.createdAt >= since)
    const attachments = fresh.flatMap((m) => m.attachments ?? [])
    const body = fresh.map((m) => m.body).join('\n\n')
    const extra = attachments.length > 0 ? { attachments } : {}
    if (!thread.anchor) {
      return { kind: 'global' as const, quote: '', startLine: 0, endLine: 0, body, ...extra }
    }
    const quote = thread.anchor.quote
    return { kind: 'comment' as const, quote, ...linesOf(markdown, quote), body, ...extra }
  })
}

export function buildPageReviewResult(args: {
  request: PlanAnnotationRequest
  decision: PlanAnnotationDecision
  threads: readonly PageCommentThread[]
  since: number
  /** Round text as the page editor writes it, so formatting alone is not an edit. */
  baseline: string
  current: string
}): PlanAnnotationResult {
  const { request, decision, baseline, current } = args
  if (decision === 'dismissed') {
    return { decision, annotations: [] }
  }
  const diff =
    samePlanText(current, request.content) || samePlanText(current, baseline)
      ? ''
      : unifiedPlanDiff(baseline, current)
  return {
    decision,
    annotations: threadsToAnnotations(args.threads, args.since, current),
    // The page is saved either way; only a page the agent named is its plan on disk.
    ...(diff ? { edits: { unifiedDiff: diff, appliedToDisk: request.pageIsSource === true } } : {})
  }
}
