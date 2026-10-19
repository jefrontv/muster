// What the seated composer shows in its own place while a request is pending:
// the plan review card for ExitPlanMode, the approval card for anything else.

import type React from 'react'
import type { NativeChatComposerApproval } from './NativeChatApprovalPanel'
import { NativeChatSeatApprovalCard } from './NativeChatSeatApprovalCard'
import { NativeChatSeatPlanReviewCard } from './NativeChatSeatPlanReviewCard'
import { isPlanReviewTool } from './native-chat-plan-summary'

export function NativeChatSeatTakeover({
  approval,
  onDiscuss
}: {
  approval: NativeChatComposerApproval
  onDiscuss: () => void
}): React.JSX.Element {
  // Keyed per request so a queued follow-up starts with fresh answered state.
  return isPlanReviewTool(approval.request.toolName) ? (
    <NativeChatSeatPlanReviewCard
      key={approval.request.requestId}
      approval={approval}
      onDiscuss={onDiscuss}
    />
  ) : (
    <NativeChatSeatApprovalCard key={approval.request.requestId} approval={approval} />
  )
}
