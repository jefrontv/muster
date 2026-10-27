import { readFileSync, statSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import type { CommandHandler } from '../dispatch'
import { glyph, isCliStyleEnabled, startSpinner, statusLine, tone } from '../cli-style'
import { getOptionalPositiveIntegerFlag, getOptionalStringFlag } from '../flags'
import { printResult } from '../format'
import { ensureMusterWindow, expandHomePath } from '../open-path-command'
import type { RuntimeClient, RuntimeRpcSuccess } from '../runtime-client'
import { RuntimeClientError } from '../runtime-client'

const DEFAULT_TIMEOUT_SECONDS = 540
// Why: short RPC waits survive relays and sockets that drop long idle requests.
const AWAIT_CHUNK_MS = 60_000
const AWAIT_RPC_SLACK_MS = 15_000

export const PLAN_REVIEW_EXIT = { proceed: 0, error: 1, pending: 2, annotated: 3, unknown: 4 }

type PlanReviewDecision = 'annotated' | 'approved' | 'approved_with_notes' | 'dismissed'

export type PlanReviewAwaitResult =
  | { status: 'pending'; openedMs: number }
  | { status: 'unknown' }
  | {
      status: 'settled'
      decision: PlanReviewDecision
      feedback: string
      annotations: unknown[]
      edits?: unknown
      reason?: string
    }

function readPlanFile(rawPath: string, cwd: string): { path: string; content: string } {
  const path = resolve(cwd, expandHomePath(rawPath))
  let isDirectory: boolean
  try {
    isDirectory = statSync(path).isDirectory()
  } catch {
    throw new RuntimeClientError('invalid_argument', `No such file: ${path}`)
  }
  if (isDirectory) {
    throw new RuntimeClientError(
      'invalid_argument',
      `${path} is a folder. Pass the plan file, not its folder.`
    )
  }
  if (!['.md', '.markdown'].includes(extname(path).toLowerCase())) {
    throw new RuntimeClientError('invalid_argument', `Not a markdown file: ${path}`)
  }
  return { path, content: readFileSync(path, 'utf8') }
}

async function awaitDecision(
  client: RuntimeClient,
  reviewId: string,
  timeoutMs: number
): Promise<RuntimeRpcSuccess<PlanReviewAwaitResult>> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const waitMs = Math.max(0, Math.min(AWAIT_CHUNK_MS, deadline - Date.now()))
    const response = await client.call<PlanReviewAwaitResult>(
      'planReview.await',
      { reviewId, waitMs },
      { timeoutMs: waitMs + AWAIT_RPC_SLACK_MS }
    )
    if (response.result.status !== 'pending' || Date.now() >= deadline) {
      return response
    }
  }
}

function exitCodeFor(result: PlanReviewAwaitResult): number {
  if (result.status === 'pending') {
    return PLAN_REVIEW_EXIT.pending
  }
  if (result.status === 'unknown') {
    return PLAN_REVIEW_EXIT.unknown
  }
  return result.decision === 'annotated' ? PLAN_REVIEW_EXIT.annotated : PLAN_REVIEW_EXIT.proceed
}

const DECISION_HEADLINES: Record<PlanReviewDecision, string> = {
  approved: 'Approved',
  approved_with_notes: 'Approved with notes',
  annotated: 'Annotated: revise the plan, then run muster annotate again',
  dismissed: 'Dismissed'
}

export function formatPlanReviewResult(reviewId: string, result: PlanReviewAwaitResult): string {
  const resume = `muster annotate --resume ${reviewId}`
  const styled = isCliStyleEnabled()
  if (result.status === 'pending') {
    const seconds = Math.round(result.openedMs / 1000)
    return styled
      ? `${statusLine('warning', `Still waiting after ${seconds}s`)}\n  ${tone('muted', 'resume')}  ${resume}`
      : `status: pending\nreview_id: ${reviewId}\nopen_for_seconds: ${seconds}\nNext step: ${resume}`
  }
  if (result.status === 'unknown') {
    const message = `No review ${reviewId}. It was never opened or has expired; open a new review.`
    return styled ? statusLine('failure', message) : `status: unknown\n${message}`
  }
  const headline =
    DECISION_HEADLINES[result.decision] + (result.reason ? ` (${result.reason})` : '')
  if (!styled) {
    return `decision: ${result.decision}\nreview_id: ${reviewId}\n\n${result.feedback}`
  }
  const line =
    result.decision === 'annotated'
      ? statusLine('warning', headline)
      : result.decision === 'dismissed'
        ? `${tone('muted', glyph('idle'))} ${headline}`
        : statusLine('success', headline)
  return `${line}\n\n${result.feedback}`
}

function toJsonResult(reviewId: string, result: PlanReviewAwaitResult): Record<string, unknown> {
  if (result.status !== 'settled') {
    return { review_id: reviewId, ...result }
  }
  const { status, decision, feedback, annotations, edits, reason } = result
  return {
    review_id: reviewId,
    status,
    decision,
    notes: feedback,
    annotations,
    ...(edits ? { edits } : {}),
    ...(reason ? { reason } : {})
  }
}

export const PLAN_REVIEW_HANDLERS: Record<string, CommandHandler> = {
  annotate: async ({ flags, client, cwd, json }) => {
    const rawPath = getOptionalStringFlag(flags, 'path')
    const resumeId = getOptionalStringFlag(flags, 'resume')
    if ((rawPath === undefined) === (resumeId === undefined)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Pass a plan path, or --resume <review-id>, but not both.'
      )
    }
    const timeoutMs =
      (getOptionalPositiveIntegerFlag(flags, 'timeout') ?? DEFAULT_TIMEOUT_SECONDS) * 1000
    const plan = rawPath === undefined ? null : readPlanFile(rawPath, cwd)

    await ensureMusterWindow(client)
    let reviewId = resumeId ?? ''
    if (plan) {
      const opened = await client.call<{ reviewId: string; round: number; queuedAhead: number }>(
        'planReview.open',
        { planPath: plan.path, title: basename(plan.path), content: plan.content, cwd }
      )
      reviewId = opened.result.reviewId
      if (flags.get('detach') === true) {
        printResult(
          {
            ...opened,
            result: { review_id: reviewId, round: opened.result.round, status: 'open' }
          },
          json,
          () => `review_id: ${reviewId}\nNext step: muster annotate --resume ${reviewId}`
        )
        return
      }
    }

    const spinner = json ? null : startSpinner('Waiting for your review in Muster')
    const response = await awaitDecision(client, reviewId, timeoutMs).finally(() => spinner?.stop())
    printResult({ ...response, result: toJsonResult(reviewId, response.result) }, json, () =>
      formatPlanReviewResult(reviewId, response.result)
    )
    process.exitCode = exitCodeFor(response.result)
  }
}
