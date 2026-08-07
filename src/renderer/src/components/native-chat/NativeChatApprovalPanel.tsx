// Pending tool-permission approval inside the composer frame (chat threads only):
// a header describing the oldest queued request, plus the footer actions row that
// replaces the normal composer actions while a request is showing.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { formatToolInput, humanizeToolName, summarizeToolInput } from './native-chat-tool-summary'
import type {
  NativeChatPermissionBehavior,
  NativeChatPermissionRequest
} from './native-chat-view-types'

/** The composer's view of the oldest pending request; queue answers in order. */
export type NativeChatComposerApproval = {
  request: NativeChatPermissionRequest
  /** Total queued requests; a counter shows when more are waiting. */
  count: number
  respond: (requestId: string, behavior: NativeChatPermissionBehavior) => void
  /** Interrupt the turn — also cancels the question CLI-side. */
  cancelTurn: () => void
}

export function NativeChatApprovalPanel({
  approval
}: {
  approval: NativeChatComposerApproval
}): React.JSX.Element {
  const { request, count } = approval
  const inputSummary = summarizeToolInput(request.input)
  const detail = formatToolInput(request.input)
  return (
    <div className="px-2 pt-1.5 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {translate('auto.components.native-chat.approval.pending', 'Pending approval')}
        </span>
        <span className="min-w-0 truncate text-xs font-medium">
          {humanizeToolName(request.toolName)}
          {inputSummary ? (
            <span className="ml-1.5 font-normal text-muted-foreground">{inputSummary}</span>
          ) : null}
        </span>
        {count > 1 ? <span className="text-xs text-muted-foreground">1/{count}</span> : null}
      </div>
      {detail ? (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/70 p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {detail}
        </pre>
      ) : null}
    </div>
  )
}

export function NativeChatApprovalActions({
  approval
}: {
  approval: NativeChatComposerApproval
}): React.JSX.Element {
  const { request, respond, cancelTurn } = approval
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
      <Button type="button" size="sm" variant="ghost" onClick={cancelTurn}>
        {translate('auto.components.native-chat.approval.cancelTurn', 'Cancel turn')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => respond(request.requestId, 'deny')}
      >
        {translate('auto.components.native-chat.approval.decline', 'Decline')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => respond(request.requestId, 'allow-always')}
      >
        {translate('auto.components.native-chat.approval.alwaysAllow', 'Always allow this session')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="default"
        onClick={() => respond(request.requestId, 'allow')}
      >
        {translate('auto.components.native-chat.approval.approveOnce', 'Approve once')}
      </Button>
    </div>
  )
}
