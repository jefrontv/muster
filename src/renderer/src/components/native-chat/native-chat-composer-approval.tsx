// A pending tool-permission request as the composer sees it, and the Allow button's extra grants.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { humanizeToolName } from './native-chat-tool-summary'
import type {
  NativeChatPermissionBehavior,
  NativeChatPermissionRequest
} from './native-chat-view-types'

/** The composer's view of the oldest pending request; queue answers in order. */
export type NativeChatComposerApproval = {
  request: NativeChatPermissionRequest
  /** Total queued requests; a counter shows when more are waiting. */
  count: number
  /** `message` reaches the agent with a denial (plan review's Discuss). */
  respond: (requestId: string, behavior: NativeChatPermissionBehavior, message?: string) => void
  /** Interrupt the turn — also cancels the question CLI-side. */
  cancelTurn: () => void
}

/** The Allow split button's extra grants. */
export function NativeChatApprovalAllowMenuContent({
  approval
}: {
  approval: NativeChatComposerApproval
}): React.JSX.Element {
  const { request, respond } = approval
  return (
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
  )
}
