import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  clearPlanAnnotationsForTests,
  clearPlanRoundsForTests,
  openPlanAnnotation,
  respondPlanAnnotation,
  setPlanAnnotationSender
} from '../../../sites/plan-annotation-requests'
import type { PlanAnnotationRequest } from '../../../../shared/plan-annotation-types'
import { PLAN_REVIEW_METHODS } from './plan-review'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

const runtime = { getRuntimeId: () => 'test-runtime' } as unknown as OrcaRuntimeService

describe('plan review RPC methods', () => {
  const shown: PlanAnnotationRequest[] = []
  let tempDir: string

  beforeEach(() => {
    shown.length = 0
    setPlanAnnotationSender((request) => shown.push(request))
    tempDir = mkdtempSync(join(tmpdir(), 'muster-plan-rpc-'))
  })

  afterEach(() => {
    clearPlanAnnotationsForTests()
    clearPlanRoundsForTests()
    setPlanAnnotationSender(null)
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('opens a review and collects the verdict as markdown feedback', async () => {
    const planPath = join(tempDir, 'plan.md')
    writeFileSync(planPath, '# Plan\n')
    const dispatcher = new RpcDispatcher({ runtime, methods: PLAN_REVIEW_METHODS })

    const opened = await dispatcher.dispatch(
      makeRequest('planReview.open', {
        planPath,
        title: 'plan.md',
        content: '# Plan\n',
        cwd: '/work/site'
      })
    )
    const reviewId = (opened as { result: { reviewId: string } }).result.reviewId
    expect(shown[0]).toMatchObject({ planPath, project: 'site', agent: 'muster annotate' })

    respondPlanAnnotation(reviewId, {
      decision: 'annotated',
      annotations: [{ kind: 'global', quote: '', startLine: 0, endLine: 0, body: 'Split step 2' }]
    })
    const collected = await dispatcher.dispatch(
      makeRequest('planReview.await', { reviewId, waitMs: 10 })
    )
    expect(collected).toMatchObject({
      ok: true,
      result: { status: 'settled', decision: 'annotated', feedback: '- **General:** Split step 2' }
    })
  })

  it('drops a plan path whose local file does not match the sent content', async () => {
    const dispatcher = new RpcDispatcher({ runtime, methods: PLAN_REVIEW_METHODS })
    await dispatcher.dispatch(
      makeRequest('planReview.open', {
        planPath: '/home/remote/plan.md',
        title: 'plan.md',
        content: '# Remote plan\n'
      })
    )
    expect(shown[0]?.planPath).toBeNull()
  })

  it('collects a review opened by another transport, and reports unknown ids', async () => {
    const opened = openPlanAnnotation({
      planPath: null,
      title: 'Plan',
      content: '# Plan',
      agent: 'claude-code',
      project: null
    })
    if ('error' in opened) {
      throw new Error('expected a window')
    }
    const dispatcher = new RpcDispatcher({ runtime, methods: PLAN_REVIEW_METHODS })
    const pending = await dispatcher.dispatch(
      makeRequest('planReview.await', { reviewId: opened.requestId, waitMs: 5 })
    )
    expect(pending).toMatchObject({ result: { status: 'pending' } })
    const unknown = await dispatcher.dispatch(
      makeRequest('planReview.await', { reviewId: 'nope', waitMs: 5 })
    )
    expect(unknown).toMatchObject({ result: { status: 'unknown' } })
  })

  it('fails clearly when no window can show the review', async () => {
    setPlanAnnotationSender(null)
    const dispatcher = new RpcDispatcher({ runtime, methods: PLAN_REVIEW_METHODS })
    const response = await dispatcher.dispatch(
      makeRequest('planReview.open', { title: 'Plan', content: '# Plan' })
    )
    expect(response).toMatchObject({ ok: false })
    expect(JSON.stringify(response)).toContain('no window open')
  })
})
