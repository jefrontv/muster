// Draws one timeline row by kind. Kept apart from the list so the list owns
// scrolling and paging only, and memoized rows skip work when their row is unchanged.

import { memo } from 'react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import type { NativeChatTimelineRow } from './native-chat-timeline-rows'
import { NativeChatMessageRow } from './NativeChatMessageRow'
import { NativeChatWorkLog } from './NativeChatWorkLog'
import { NativeChatChangedFilesRow } from './NativeChatChangedFilesRow'
import { NativeChatTurnPlanRow } from './NativeChatTurnPlanRow'
import { NativeChatTurnErrorRow } from './NativeChatTurnErrorRow'

export type NativeChatRowToggle = (kind: 'work' | 'plan' | 'changes', key: string) => void

export type NativeChatTimelineRowActions = {
  onToggle: NativeChatRowToggle
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks: boolean
  failedDeliveryMessageIds?: ReadonlySet<string>
  /** Resend the turn's prompt (Retry under a reply or a failed turn). */
  onRetry?: (messageId: string | null) => void
}

export const NativeChatTimelineRowView = memo(function NativeChatTimelineRowView({
  row,
  actions
}: {
  row: NativeChatTimelineRow
  actions: NativeChatTimelineRowActions
}): React.JSX.Element | null {
  switch (row.kind) {
    case 'message':
      return (
        <NativeChatMessageRow
          message={row.message}
          onLinkClick={actions.onLinkClick}
          allowFileUriLinks={actions.allowFileUriLinks}
          deliveryFailed={actions.failedDeliveryMessageIds?.has(row.message.id) === true}
          replyActions={row.showReplyActions ? (row.isLatestReply ? 'always' : 'hover') : 'none'}
          onRetry={actions.onRetry ? () => actions.onRetry?.(row.message.id) : undefined}
        />
      )
    case 'work-log':
      return (
        <NativeChatWorkLog
          work={row.work}
          presentation={row.presentation}
          live={row.live}
          durationMs={row.durationMs}
          interrupted={row.interrupted}
          onToggle={() => actions.onToggle('work', row.live ? `${row.turnId}:live` : row.turnId)}
        />
      )
    case 'turn-changed-files':
      return (
        <NativeChatChangedFilesRow
          changed={row.changed}
          expanded={row.expanded}
          onToggle={() => actions.onToggle('changes', row.turnId)}
        />
      )
    case 'turn-plan':
      return (
        <NativeChatTurnPlanRow
          plan={row.plan}
          expanded={row.expanded}
          onToggle={() => actions.onToggle('plan', row.turnId)}
        />
      )
    case 'turn-error':
      return (
        <NativeChatTurnErrorRow
          message={row.message}
          onRetry={actions.onRetry ? () => actions.onRetry?.(null) : undefined}
        />
      )
  }
})
