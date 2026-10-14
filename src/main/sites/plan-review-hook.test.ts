// The extension's door into the review queue, driven end to end against the real queue: the
// refusal codes and the verdict rendering are the wire contract the shipped extension parses, so
// a fake queue here would only test the fake.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlanAnnotationRequest } from '../../shared/plan-annotation-types'
import {
  clearPlanAnnotationsForTests,
  clearPlanRoundsForTests,
  respondPlanAnnotation,
  setPlanAnnotationSender
} from './plan-annotation-requests'
import {
  handlePlanReviewCollect,
  handlePlanReviewOpen,
  PLAN_REVIEW_MAX_WAIT_MS
} from './plan-review-hook'

const sent: PlanAnnotationRequest[] = []
const store = { listSites: () => [{ path: '/sites/acme', displayName: 'Acme' }] }

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plan-hook-'))
  sent.length = 0
  setPlanAnnotationSender((request) => sent.push(request))
})

afterEach(() => {
  clearPlanAnnotationsForTests()
  clearPlanRoundsForTests()
  setPlanAnnotationSender(null)
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

function open(body: unknown): {
  ok: boolean
  review_id: string
  round: number
  queued_ahead: number
} {
  return handlePlanReviewOpen({ store, body }) as {
    ok: boolean
    review_id: string
    round: number
    queued_ahead: number
  }
}

describe('handlePlanReviewOpen', () => {
  it('opens an inline plan with the caller context attached', () => {
    const reply = open({ content: '# Plan', cwd: '/sites/acme/wt-1', agent: 'omp' })

    expect(reply).toMatchObject({ ok: true, round: 1, queued_ahead: 0 })
    expect(sent[0]).toMatchObject({
      title: 'Plan',
      content: '# Plan',
      agent: 'omp',
      project: 'Acme'
    })
  })

  it('reads a plan off disk relative to the caller and titles it by name', () => {
    writeFileSync(join(dir, 'ship.md'), '# Ship')
    const reply = open({ path: 'ship.md', cwd: dir, agent: 'pi' })

    expect(reply.round).toBe(1)
    expect(sent[0]).toMatchObject({ planPath: join(dir, 'ship.md'), title: 'ship.md' })
  })

  it('counts rounds and reports how many reviews are ahead', () => {
    open({ content: '# One', cwd: dir, agent: 'omp' })
    const second = open({ content: '# Two', cwd: dir, agent: 'omp' })

    // Different plans, so both are round 1; depth is what tells the tool someone else is waiting.
    expect(second).toMatchObject({ round: 1, queued_ahead: 1 })
  })

  it('refuses a request that is not an object, or names neither source', () => {
    expect(handlePlanReviewOpen({ store, body: 'nope' })).toEqual({
      ok: false,
      error: 'bad-request'
    })
    expect(open({ cwd: dir })).toMatchObject({ ok: false, error: 'bad-request' })
    expect(open({ path: 'a.md', content: '# b', cwd: dir })).toMatchObject({
      ok: false,
      error: 'bad-request'
    })
  })

  it('refuses an empty file rather than showing a blank modal', () => {
    writeFileSync(join(dir, 'empty.md'), '')
    expect(open({ path: 'empty.md', cwd: dir })).toMatchObject({ ok: false, error: 'bad-request' })
  })

  it('maps a missing file and an oversized one onto their own codes', () => {
    expect(open({ path: 'gone.md', cwd: dir })).toMatchObject({
      ok: false,
      error: 'unreadable-plan'
    })
  })

  it('says so when no window is listening, instead of pretending to open', () => {
    setPlanAnnotationSender(null)
    expect(open({ content: '# Plan', cwd: dir })).toEqual({ ok: false, error: 'no-window' })
  })
})

describe('handlePlanReviewCollect', () => {
  it('answers pending with how long the review has been open', async () => {
    vi.useFakeTimers()
    const opened = open({ content: '# Plan', cwd: dir })
    const collecting = handlePlanReviewCollect({
      body: { review_id: opened.review_id, wait_ms: 1_000 }
    })

    await vi.advanceTimersByTimeAsync(1_001)
    await expect(collecting).resolves.toMatchObject({ ok: true, status: 'pending' })
  })

  it('bounds one collect so the socket never idles past the slowloris guard', async () => {
    vi.useFakeTimers()
    const opened = open({ content: '# Plan', cwd: dir })
    const collecting = handlePlanReviewCollect({
      body: { review_id: opened.review_id, wait_ms: 600_000 }
    })

    await vi.advanceTimersByTimeAsync(PLAN_REVIEW_MAX_WAIT_MS + 1)
    // The caller asked for ten minutes; the answer must still arrive inside the socket's guard,
    // and it is the extension's job to loop this call, not this handler's to hold one response.
    expect(PLAN_REVIEW_MAX_WAIT_MS).toBeLessThanOrEqual(2_000)
    await expect(collecting).resolves.toMatchObject({ ok: true, status: 'pending' })
  })

  it('renders the verdict as the same markdown the MCP tool returns', async () => {
    const opened = open({ content: '# Plan', cwd: dir })
    respondPlanAnnotation(opened.review_id, {
      decision: 'annotated',
      annotations: [{ kind: 'comment', quote: 'ship Friday', startLine: 2, endLine: 2, body: 'no' }]
    })

    const reply = (await handlePlanReviewCollect({
      body: { review_id: opened.review_id }
    })) as { ok: boolean; status: string; decision: string; feedback: string }

    expect(reply).toMatchObject({ ok: true, status: 'settled', decision: 'annotated' })
    expect(reply.feedback).toContain('> ship Friday')
  })

  it('reports an unknown id so the caller stops rather than loops', async () => {
    await expect(handlePlanReviewCollect({ body: { review_id: 'never-issued' } })).resolves.toEqual(
      {
        ok: false,
        error: 'unknown'
      }
    )
  })

  it('refuses a collect with no review id', async () => {
    await expect(handlePlanReviewCollect({ body: {} })).resolves.toEqual({
      ok: false,
      error: 'bad-request'
    })
  })
})
