// The list of agents a task can go to, and the delivery itself.
//
// Sending goes through `submitPromptToAgentTab`, the same path the source-control actions use. That
// function owns bracketed paste, the per-agent readiness wait, native prefill for agents that
// support it and chunking above the size cap. A second delivery path would duplicate all four
// decisions and then drift from them.
//
// A failed send says so. `submitPromptToAgentTab` answers false rather than throwing when the tab
// has no pty by the time it gives up, and a silent false is the one outcome a user cannot debug.
//
// Copying sits in this menu rather than beside it: choosing where a prompt goes and choosing to
// edit it first are the same decision, and one of the two destinations is the clipboard.

import { useState } from 'react'
import { Copy } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { submitPromptToAgentTab } from '@/lib/agent-paste-draft'
import { toast } from 'sonner'
import type { TaskSendTarget } from './tasks-panel-send-targets'

export function TasksPanelSendMenu({
  targets,
  buildPrompt,
  onSent,
  children
}: {
  targets: readonly TaskSendTarget[]
  /** Built at send time, not at render time, so it cannot go stale between the two. */
  buildPrompt: () => string | null
  onSent?: () => void
  /** The trigger, so a toolbar icon and a labelled button can share this menu. */
  children: (state: { sending: boolean; disabled: boolean }) => React.ReactNode
}): React.JSX.Element {
  const [sending, setSending] = useState(false)

  const send = async (target: TaskSendTarget): Promise<void> => {
    const prompt = buildPrompt()
    if (!prompt) {
      return
    }
    setSending(true)
    try {
      const delivered = await submitPromptToAgentTab({ tabId: target.tabId, content: prompt })
      if (!delivered) {
        toast.error(
          translate(
            'auto.components.right.sidebar.tasks.send_failed',
            'Could not reach {{name}}. It may have exited.'
          ).replace('{{name}}', target.label)
        )
        return
      }
      toast.success(
        translate('auto.components.right.sidebar.tasks.sent', 'Sent to {{name}}').replace(
          '{{name}}',
          target.label
        )
      )
      onSent?.()
    } finally {
      setSending(false)
    }
  }

  const copy = async (): Promise<void> => {
    const prompt = buildPrompt()
    if (!prompt) {
      return
    }
    await window.api.ui.writeClipboardText(prompt)
    toast.success(
      translate('auto.components.right.sidebar.tasks.copied', 'Prompt copied to the clipboard')
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children({ sending, disabled: sending || targets.length === 0 })}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy className="size-3.5" />
          {translate('auto.components.right.sidebar.tasks.copy_prompt', 'Copy prompt')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {targets.length === 0 ? (
          <DropdownMenuItem disabled>
            {translate(
              'auto.components.right.sidebar.tasks.no_agents',
              'No agent session is open here.'
            )}
          </DropdownMenuItem>
        ) : (
          targets.map((target) => (
            <DropdownMenuItem key={target.tabId} onSelect={() => void send(target)}>
              <span className="truncate">{target.label}</span>
              {target.agent ? (
                <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                  {target.agent}
                </span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
