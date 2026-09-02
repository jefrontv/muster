import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPlanAnnotationsForTests,
  listPendingPlanAnnotations,
  PLAN_ANNOTATION_RESULT_RETENTION_MS,
  PLAN_ANNOTATION_TIMEOUT_MS,
  awaitPlanAnnotationResult,
  openPlanAnnotation,
  respondPlanAnnotation,
  setPlanAnnotationQueuedSender,
  setPlanAnnotationResolvedSender,
  setPlanAnnotationSender
} from './plan-annotation-requests'
import type { PlanAnnotationRequest } from '../../shared/plan-annotation-types'

const sent: PlanAnnotationRequest[] = []
const resolved: string[] = []
const depths: number[] = []

function plan(title: string): Omit<PlanAnnotationRequest, 'requestId'> {
  return {
    planPath: `/plans/${title}.md`,
    title,
    content: `# ${title}`,
    agent: 'claude-code',
    project: 'acme',
    round: 1,
    previousContent: null
  }
}

beforeEach(() => {
  sent.length = 0
  resolved.length = 0
  depths.length = 0
  setPlanAnnotationSender((request) => sent.push(request))
  setPlanAnnotationResolvedSender((requestId) => resolved.push(requestId))
  setPlanAnnotationQueuedSender((count) => depths.push(count))
})

afterEach(() => {
  clearPlanAnnotationsForTests()
  setPlanAnnotationSender(null)
  setPlanAnnotationResolvedSender(null)
  vi.useRealTimers()
})

function open(title: string): string {
  const opened = openPlanAnnotation(plan(title))
  if (!('requestId' in opened)) {
    throw new Error('expected the review to open')
  }
  return opened.requestId
}

/** Collects with no wait: the verdict is either already there or it is not. */
function collect(reviewId: string): ReturnType<typeof awaitPlanAnnotationResult> {
  return awaitPlanAnnotationResult(reviewId, 0)
}

describe('openPlanAnnotation', () => {
  it('returns an id at once rather than waiting for the reviewer', () => {
    // Why this matters: an MCP tool call is cancelled at its client's timeout, commonly 30s, so
    // opening a review must never be the thing that blocks.
    const id = open('one')
    expect(id).toMatch(/\S/)
    expect(sent).toHaveLength(1)
  })

  it('hands the verdict to a later collect', async () => {
    const id = open('one')
    respondPlanAnnotation(id, {
      decision: 'annotated',
      annotations: [
        { kind: 'comment', quote: 'do the thing', startLine: 3, endLine: 3, body: 'not like that' }
      ]
    })

    await expect(collect(id)).resolves.toMatchObject({
      status: 'settled',
      result: { decision: 'annotated' }
    })
  })

  it('reports no window rather than opening a review nobody can see', () => {
    setPlanAnnotationSender(null)
    expect(openPlanAnnotation(plan('headless'))).toEqual({ error: 'no-window' })
  })
})

describe('awaitPlanAnnotationResult', () => {
  it('answers pending while the user is still reading, so the caller can poll', async () => {
    const id = open('reading')
    await expect(collect(id)).resolves.toMatchObject({ status: 'pending' })
  })

  it('wakes a parked poll the moment the user answers', async () => {
    const id = open('parked')
    const parked = awaitPlanAnnotationResult(id, 60_000)
    respondPlanAnnotation(id, { decision: 'approved', annotations: [] })
    await expect(parked).resolves.toMatchObject({
      status: 'settled',
      result: { decision: 'approved' }
    })
  })

  it('keeps the verdict collectable, because it lands between two polls', async () => {
    const id = open('retained')
    respondPlanAnnotation(id, { decision: 'approved', annotations: [] })

    // Why twice: polling is a retry loop, and a verdict consumed by the first reader would leave
    // an agent that retried with nothing.
    await expect(collect(id)).resolves.toMatchObject({ status: 'settled' })
    await expect(collect(id)).resolves.toMatchObject({ status: 'settled' })
  })

  it('drops a retained verdict once it ages out', async () => {
    vi.useFakeTimers()
    const id = open('stale')
    respondPlanAnnotation(id, { decision: 'approved', annotations: [] })
    await vi.advanceTimersByTimeAsync(PLAN_ANNOTATION_RESULT_RETENTION_MS + 1_000)
    await expect(collect(id)).resolves.toEqual({ status: 'unknown' })
  })

  it('says unknown for an id it never issued, so a caller stops polling', async () => {
    await expect(collect('never-issued')).resolves.toEqual({ status: 'unknown' })
  })

  it('serves every poll parked on the same review', async () => {
    const id = open('shared')
    const both = Promise.all([
      awaitPlanAnnotationResult(id, 60_000),
      awaitPlanAnnotationResult(id, 60_000)
    ])
    respondPlanAnnotation(id, { decision: 'approved', annotations: [] })
    for (const outcome of await both) {
      expect(outcome).toMatchObject({ status: 'settled' })
    }
  })
})

describe('the review queue', () => {
  it('shows one review at a time and never drops the second', async () => {
    const first = open('first')
    const second = open('second')

    // Why: a second agent arriving mid-review must not replace what the user is already reading.
    expect(sent.map((request) => request.title)).toEqual(['first'])
    expect(listPendingPlanAnnotations().map((request) => request.title)).toEqual([
      'first',
      'second'
    ])

    respondPlanAnnotation(first, { decision: 'approved', annotations: [] })
    await expect(collect(first)).resolves.toMatchObject({ result: { decision: 'approved' } })

    expect(sent.map((request) => request.title)).toEqual(['first', 'second'])
    respondPlanAnnotation(second, { decision: 'dismissed', annotations: [] })
    await expect(collect(second)).resolves.toMatchObject({ result: { decision: 'dismissed' } })
  })

  it('starts a queued review’s clock only when it reaches the front', async () => {
    vi.useFakeTimers()
    const first = open('slow')
    const second = open('waiting')

    // The whole budget elapses while `waiting` is still queued behind `slow`.
    await vi.advanceTimersByTimeAsync(PLAN_ANNOTATION_TIMEOUT_MS + 1_000)
    await expect(collect(first)).resolves.toMatchObject({
      result: { decision: 'dismissed', reason: 'timeout' }
    })

    // Why: if the clock had started on arrival, this review would already be dead having never
    // been shown to anyone.
    expect(sent.map((request) => request.title)).toEqual(['slow', 'waiting'])
    respondPlanAnnotation(second, { decision: 'approved', annotations: [] })
    await expect(collect(second)).resolves.toMatchObject({ result: { decision: 'approved' } })
  })

  it('times the front review out rather than holding the agent forever', async () => {
    vi.useFakeTimers()
    const id = open('forgotten')
    await vi.advanceTimersByTimeAsync(PLAN_ANNOTATION_TIMEOUT_MS + 1)
    await expect(collect(id)).resolves.toMatchObject({
      status: 'settled',
      result: { decision: 'dismissed', reason: 'timeout' }
    })
  })
})

describe('respondPlanAnnotation', () => {
  it('ignores a second response for the same review', async () => {
    const id = open('once')

    expect(respondPlanAnnotation(id, { decision: 'approved', annotations: [] })).toBe(true)
    // A double submit, or a response racing the timeout, must not throw or overwrite the verdict.
    expect(respondPlanAnnotation(id, { decision: 'annotated', annotations: [] })).toBe(false)
    await expect(collect(id)).resolves.toMatchObject({ result: { decision: 'approved' } })
  })

  it('reports failure for an unknown review', () => {
    expect(respondPlanAnnotation('never-issued', { decision: 'approved', annotations: [] })).toBe(
      false
    )
  })
})

describe('settled announcements', () => {
  it('announces a review answered here, so other windows drop it', async () => {
    const pending = open('answered')
    const id = sent[0]!.requestId

    respondPlanAnnotation(id, { decision: 'approved', annotations: [] })
    await pending

    expect(resolved).toEqual([id])
  })

  it('announces a timeout, which no window would otherwise learn about', async () => {
    vi.useFakeTimers()
    const pending = open('forgotten')
    const id = sent[0]!.requestId

    await vi.advanceTimersByTimeAsync(PLAN_ANNOTATION_TIMEOUT_MS + 1)
    await pending

    // Without this the window keeps a modal that looks live and answers nothing.
    expect(resolved).toEqual([id])
  })
})

describe('queue depth', () => {
  it('reports how many reviews are stacked behind the front one', async () => {
    // Why this exists: only the front review is ever sent to a window, so a renderer counting the
    // requests it received always saw one and could never tell the reviewer more was coming.
    open('first')
    expect(depths.at(-1)).toBe(0)

    open('second')
    open('third')
    expect(depths.at(-1)).toBe(2)

    // Only the front was ever pushed to the window, which is the behaviour that made the count
    // necessary in the first place.
    expect(sent.map((request) => request.title)).toEqual(['first'])

    respondPlanAnnotation(sent[0]!.requestId, { decision: 'approved', annotations: [] })
    await Promise.resolve()
    expect(depths.at(-1)).toBe(1)
    expect(sent.map((request) => request.title)).toEqual(['first', 'second'])
  })

  it('reports an empty queue once the last review settles', async () => {
    open('only')
    respondPlanAnnotation(sent[0]!.requestId, { decision: 'approved', annotations: [] })
    await Promise.resolve()
    expect(depths.at(-1)).toBe(0)
    expect(listPendingPlanAnnotations()).toEqual([])
  })
})
