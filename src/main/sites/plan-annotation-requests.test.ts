import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPlanAnnotationsForTests,
  listPendingPlanAnnotations,
  PLAN_ANNOTATION_TIMEOUT_MS,
  requestPlanAnnotation,
  respondPlanAnnotation,
  setPlanAnnotationSender
} from './plan-annotation-requests'
import type { PlanAnnotationRequest } from '../../shared/plan-annotation-types'

const sent: PlanAnnotationRequest[] = []

function plan(title: string): Omit<PlanAnnotationRequest, 'requestId'> {
  return {
    planPath: `/plans/${title}.md`,
    title,
    content: `# ${title}`,
    round: 1,
    previousContent: null
  }
}

beforeEach(() => {
  sent.length = 0
  setPlanAnnotationSender((request) => sent.push(request))
})

afterEach(() => {
  clearPlanAnnotationsForTests()
  setPlanAnnotationSender(null)
  vi.useRealTimers()
})

describe('requestPlanAnnotation', () => {
  it('resolves with the reviewer decision', async () => {
    const pending = requestPlanAnnotation(plan('one'))
    expect(sent).toHaveLength(1)

    respondPlanAnnotation(sent[0]!.requestId, {
      decision: 'annotated',
      annotations: [
        { kind: 'comment', quote: 'do the thing', startLine: 3, endLine: 3, body: 'not like that' }
      ]
    })

    await expect(pending).resolves.toMatchObject({ decision: 'annotated' })
  })

  it('dismisses immediately when no window is listening', async () => {
    setPlanAnnotationSender(null)
    await expect(requestPlanAnnotation(plan('headless'))).resolves.toEqual({
      decision: 'dismissed',
      annotations: [],
      reason: 'no-window'
    })
  })
})

describe('the review queue', () => {
  it('shows one review at a time and never drops the second', async () => {
    const first = requestPlanAnnotation(plan('first'))
    const second = requestPlanAnnotation(plan('second'))

    // Why: a second agent arriving mid-review must not replace what the user is already reading.
    expect(sent.map((request) => request.title)).toEqual(['first'])
    expect(listPendingPlanAnnotations().map((request) => request.title)).toEqual([
      'first',
      'second'
    ])

    respondPlanAnnotation(sent[0]!.requestId, { decision: 'approved', annotations: [] })
    await expect(first).resolves.toMatchObject({ decision: 'approved' })

    expect(sent.map((request) => request.title)).toEqual(['first', 'second'])
    respondPlanAnnotation(sent[1]!.requestId, { decision: 'dismissed', annotations: [] })
    await expect(second).resolves.toMatchObject({ decision: 'dismissed' })
  })

  it('starts a queued review’s clock only when it reaches the front', async () => {
    vi.useFakeTimers()
    const first = requestPlanAnnotation(plan('slow'))
    const second = requestPlanAnnotation(plan('waiting'))

    // The whole budget elapses while `waiting` is still queued behind `slow`.
    await vi.advanceTimersByTimeAsync(PLAN_ANNOTATION_TIMEOUT_MS + 1_000)
    await expect(first).resolves.toMatchObject({ decision: 'dismissed', reason: 'timeout' })

    // Why: if the clock had started on arrival, this review would already be dead having never
    // been shown to anyone.
    expect(sent.map((request) => request.title)).toEqual(['slow', 'waiting'])
    respondPlanAnnotation(sent[1]!.requestId, { decision: 'approved', annotations: [] })
    await expect(second).resolves.toMatchObject({ decision: 'approved' })
  })

  it('times the front review out rather than holding the agent forever', async () => {
    vi.useFakeTimers()
    const pending = requestPlanAnnotation(plan('forgotten'))
    await vi.advanceTimersByTimeAsync(PLAN_ANNOTATION_TIMEOUT_MS + 1)
    await expect(pending).resolves.toEqual({
      decision: 'dismissed',
      annotations: [],
      reason: 'timeout'
    })
  })
})

describe('respondPlanAnnotation', () => {
  it('ignores a second response for the same review', async () => {
    const pending = requestPlanAnnotation(plan('once'))
    const id = sent[0]!.requestId

    expect(respondPlanAnnotation(id, { decision: 'approved', annotations: [] })).toBe(true)
    // A double submit, or a response racing the timeout, must not throw or resolve twice.
    expect(respondPlanAnnotation(id, { decision: 'annotated', annotations: [] })).toBe(false)
    await expect(pending).resolves.toMatchObject({ decision: 'approved' })
  })

  it('reports failure for an unknown review', () => {
    expect(respondPlanAnnotation('never-issued', { decision: 'approved', annotations: [] })).toBe(
      false
    )
  })
})
