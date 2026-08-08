// Pending tool-permission approval inside the composer frame (chat threads only):
// a header describing the oldest queued request, plus the footer actions row that
// replaces the normal composer actions while a request is showing.

import { ChevronDown, ShieldAlert } from 'lucide-react'
import type React from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { formatToolInput, humanizeToolName, toolFilePath } from './native-chat-tool-summary'
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

/** Tool-aware rendering: the command/path the user actually judges, with the
 *  model's own description as the caption — raw JSON only as a last resort. */
export function approvalRequestDetail(input: unknown): {
  caption: string | null
  code: string | null
} {
  if (input && typeof input === 'object') {
    const value = input as Record<string, unknown>
    const description = typeof value.description === 'string' ? value.description : null
    const command = value.command ?? value.cmd ?? value.query ?? value.pattern
    if (typeof command === 'string' && command.length > 0) {
      return { caption: description, code: command }
    }
    const path = toolFilePath(input)
    if (path) {
      return { caption: description, code: path }
    }
  }
  const fallback = formatToolInput(input)
  return { caption: null, code: fallback.length > 0 ? fallback : null }
}

export function NativeChatApprovalPanel({
  approval
}: {
  approval: NativeChatComposerApproval
}): React.JSX.Element {
  const { request, count } = approval
  const detail = approvalRequestDetail(request.input)
  return (
    <div className="px-3 pt-2.5 pb-1">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
          <ShieldAlert className="size-3.5 text-amber-500" />
        </span>
        <span className="text-sm font-medium">{humanizeToolName(request.toolName)}</span>
        <span className="text-xs text-muted-foreground">
          {translate('auto.components.native-chat.approval.wants', 'wants to run')}
        </span>
        {count > 1 ? (
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            1/{count}
          </span>
        ) : null}
      </div>
      {detail.code ? (
        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground scrollbar-sleek">
          {detail.code}
        </pre>
      ) : null}
      {detail.caption ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{detail.caption}</p>
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
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => respond(request.requestId, 'deny')}
      >
        {translate('auto.components.native-chat.approval.decline', 'Decline')}
      </Button>
      <div className="flex items-center">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="rounded-r-none"
          onClick={() => respond(request.requestId, 'allow')}
        >
          {translate('auto.components.native-chat.approval.approve', 'Approve')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="rounded-l-none border-l border-primary-foreground/20 px-1.5"
              aria-label={translate(
                'auto.components.native-chat.approval.moreOptions',
                'More approval options'
              )}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => respond(request.requestId, 'allow-always')}>
              {translate(
                'auto.components.native-chat.approval.alwaysAllowTool',
                'Always allow {{value0}} this session',
                { value0: humanizeToolName(request.toolName) }
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => respond(request.requestId, 'allow-all')}>
              <span className="flex flex-col gap-0.5">
                <span>
                  {translate(
                    'auto.components.native-chat.approval.fullAccess',
                    'Full access this session'
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.native-chat.approval.fullAccessHint',
                    'Approves every tool without asking'
                  )}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
