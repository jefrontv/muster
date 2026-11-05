// The seated plan review takeover (DSH PlanReviewPanel) for ExitPlanMode: the
// plan's title and lead, Discuss to reply in the composer, Approve to proceed.

import type React from 'react'
import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { NativeChatComposerApproval } from './NativeChatApprovalPanel'
import { planSummary } from './native-chat-plan-summary'
import {
  CHAT_TAKEOVER_CARD_CLASS,
  CHAT_TAKEOVER_ERROR_CLASS,
  CHAT_TAKEOVER_FRAME_CLASS,
  CHAT_TAKEOVER_OUTLINE_CLASS,
  CHAT_TAKEOVER_PRIMARY_CLASS,
  CHAT_TAKEOVER_STATE_DOT_CLASS,
  CHAT_TAKEOVER_STRIP_CLASS
} from './chat-seat-takeover-classes'

// Sent with the denial so the agent stays in plan mode and waits for the reply.
const DISCUSS_MESSAGE =
  'The user wants to discuss the plan before approving it. Wait for their reply.'

export function NativeChatSeatPlanReviewCard({
  approval,
  onDiscuss
}: {
  approval: NativeChatComposerApproval
  /** Called before the denial, so the composer can take focus once it returns. */
  onDiscuss: () => void
}): React.JSX.Element {
  const { request, respond } = approval
  const [answered, setAnswered] = useState(false)
  const summary = useMemo(() => planSummary(request.input), [request.input])
  const title =
    summary.title || translate('components.native-chat.planReview.untitled', 'Proposed plan')
  const description = summary.description === title ? '' : summary.description

  return (
    <div className={CHAT_TAKEOVER_FRAME_CLASS} data-plan-review-request={request.requestId}>
      <section
        className={CHAT_TAKEOVER_CARD_CLASS}
        aria-label={translate('components.native-chat.planReview.header', 'Plan review')}
        aria-busy={answered}
      >
        <div className={cn(CHAT_TAKEOVER_STRIP_CLASS, 'py-3 text-sm leading-5')}>
          <span
            aria-hidden
            className={cn(CHAT_TAKEOVER_STATE_DOT_CLASS, answered && 'animate-pulse')}
          />
          {translate('components.native-chat.planReview.header', 'Plan review')}
        </div>
        <div className="min-w-0 px-4 pt-3.5 pb-3">
          <h3 className="m-0 truncate text-[15px] leading-[22px] font-medium" title={title}>
            {title}
          </h3>
          {description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-chat-ink-secondary">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-2 pb-3">
          <p role="status" className={CHAT_TAKEOVER_ERROR_CLASS} />
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={answered}
              onClick={() => {
                setAnswered(true)
                onDiscuss()
                respond(request.requestId, 'deny', DISCUSS_MESSAGE)
              }}
              className={CHAT_TAKEOVER_OUTLINE_CLASS}
            >
              <Pencil aria-hidden className="size-3.5" />
              {translate('components.native-chat.planReview.discuss', 'Discuss')}
            </button>
            <button
              type="button"
              disabled={answered}
              onClick={() => {
                setAnswered(true)
                respond(request.requestId, 'allow')
              }}
              className={CHAT_TAKEOVER_PRIMARY_CLASS}
            >
              {translate('components.native-chat.planReview.approve', 'Approve')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
