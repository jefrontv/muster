import { describe, expect, it } from 'vitest'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'
import type { PageCommentThread } from '../../../../shared/project-pages-comment-types'
import { buildPageReviewResult, roundThreads, samePlanText } from './page-review-result'

const PLAN = '# Plan\n\n## Steps\n\n1. Save the plan.\n2. Review it in Pages.\n'
const OPENED = 1_000

function thread(
  id: string,
  over: Partial<PageCommentThread> & { at?: number; by?: 'user' | 'agent'; body?: string } = {}
): PageCommentThread {
  const { at = OPENED + 1, by = 'user', body = 'Note', ...rest } = over
  return {
    id,
    anchor: { quote: 'Review it in Pages', prefix: '', suffix: '' },
    status: 'open',
    createdAt: at,
    updatedAt: at,
    messages: [
      {
        id: `${id}-m`,
        author: by === 'user' ? { kind: 'user' } : { kind: 'agent', agent: 'claude' },
        body,
        createdAt: at
      }
    ],
    ...rest
  }
}

function request(over: Partial<PlanAnnotationRequest> = {}): PlanAnnotationRequest {
  return {
    requestId: 'r1',
    planPath: null,
    title: 'Plan',
    content: PLAN,
    agent: 'claude',
    project: null,
    page: { scopeKey: 'repo:1', pageId: 'p1' },
    openedAt: OPENED,
    round: 1,
    previousContent: null,
    ...over
  }
}

describe('samePlanText', () => {
  it('ignores trailing spaces and extra blank lines', () => {
    expect(samePlanText('a  \n\n\n\nb\n', 'a\n\nb')).toBe(true)
    expect(samePlanText('a\nb', 'a\nc')).toBe(false)
  })
})

describe('roundThreads', () => {
  it('keeps open threads the person wrote in this round', () => {
    const threads = [
      thread('new'),
      thread('old', { at: OPENED - 5 }),
      thread('agent', { by: 'agent' }),
      thread('done', { status: 'resolved' })
    ]
    expect(roundThreads(threads, OPENED).map((t) => t.id)).toEqual(['new'])
  })
})

describe('buildPageReviewResult', () => {
  it('turns threads into notes with plan line numbers', () => {
    const result = buildPageReviewResult({
      request: request(),
      decision: 'annotated',
      threads: [
        thread('a', { body: 'Which tab?' }),
        thread('g', { anchor: null, body: 'Shorter' })
      ],
      since: OPENED,
      baseline: PLAN,
      current: PLAN
    })
    expect(result.annotations).toEqual([
      {
        kind: 'comment',
        quote: 'Review it in Pages',
        startLine: 6,
        endLine: 6,
        body: 'Which tab?'
      },
      { kind: 'global', quote: '', startLine: 0, endLine: 0, body: 'Shorter' }
    ])
    expect(result.edits).toBeUndefined()
  })

  it('sends edits as a diff, applied to disk only for a page the agent named', () => {
    const current = PLAN.replace('Save the plan.', 'Save the plan as a page.')
    const args = {
      decision: 'annotated' as const,
      threads: [],
      since: OPENED,
      baseline: PLAN,
      current
    }
    const saved = buildPageReviewResult({ ...args, request: request() })
    expect(saved.edits?.unifiedDiff).toContain('+1. Save the plan as a page.')
    expect(saved.edits?.appliedToDisk).toBe(false)
    const named = buildPageReviewResult({ ...args, request: request({ pageIsSource: true }) })
    expect(named.edits?.appliedToDisk).toBe(true)
  })

  it('treats editor reformatting as no edit', () => {
    const result = buildPageReviewResult({
      request: request(),
      decision: 'approved',
      threads: [],
      since: OPENED,
      baseline: PLAN,
      current: `${PLAN}\n\n`
    })
    expect(result).toEqual({ decision: 'approved', annotations: [] })
  })

  it('drops notes and edits on dismiss', () => {
    const result = buildPageReviewResult({
      request: request(),
      decision: 'dismissed',
      threads: [thread('a')],
      since: OPENED,
      baseline: PLAN,
      current: 'changed'
    })
    expect(result).toEqual({ decision: 'dismissed', annotations: [] })
  })
})
