// Which pending request owns the composer's place when several are queued:
// plan review first, then a question, then a tool approval.

import { isAskUserQuestionTool } from '../../../../shared/agent-question-answered-intent'
import { isPlanReviewTool } from './native-chat-plan-summary'
import type { NativeChatPermissionRequest } from './native-chat-view-types'

export type NativeChatTakeoverPick = {
  /** ExitPlanMode; while set it outranks a latched question. */
  plan: NativeChatPermissionRequest | null
  /** The oldest AskUserQuestion, for the question card. */
  question: NativeChatPermissionRequest | null
  /** What the composer shows in its own place: the plan, else the oldest approval. */
  composerRequest: NativeChatPermissionRequest | null
  /** Plan and approval requests still queued, for the "1 / N" counter. */
  composerRequestCount: number
}

export function pickNativeChatTakeover(
  requests: readonly NativeChatPermissionRequest[] | undefined
): NativeChatTakeoverPick {
  const queue = requests ?? []
  const plan = queue.find((request) => isPlanReviewTool(request.toolName)) ?? null
  const question = queue.find((request) => isAskUserQuestionTool(request.toolName)) ?? null
  const approvals = queue.filter((request) => !isAskUserQuestionTool(request.toolName))
  return {
    plan,
    question,
    composerRequest: plan ?? approvals[0] ?? null,
    composerRequestCount: approvals.length
  }
}
