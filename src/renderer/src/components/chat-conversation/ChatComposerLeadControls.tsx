// Chat mode's composer lead controls after attach: tool access (shield) and
// web access (globe). Code mode keeps its own inline access dropdown.

import type React from 'react'
import { Check, Globe, GlobeLock, ListChecks, ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useChatEngineMeta } from '@/components/chat-thread/use-chat-engine-thread'
import { CHAT_CONVERSATION_ICON_CLASS } from '@/components/native-chat/chat-seat-composer-classes'

type AccessChoice = 'ask' | 'full' | 'plan'

function AccessItem(props: {
  checked: boolean
  label: string
  hint: string
  onSelect: () => void
}): React.JSX.Element {
  return (
    <DropdownMenuItem onSelect={props.onSelect}>
      <Check className={cn('size-4', !props.checked && 'opacity-0')} />
      <span className="flex flex-col gap-0.5">
        <span>{props.label}</span>
        <span className="text-xs text-muted-foreground">{props.hint}</span>
      </span>
    </DropdownMenuItem>
  )
}

export function ChatComposerAccessMenu(props: {
  threadId: string
  fullAccess: boolean
  onSetFullAccess: (enabled: boolean) => void
}): React.JSX.Element {
  const mode = useChatEngineMeta(props.threadId)?.session.permissionMode ?? null
  const choice: AccessChoice = mode === 'plan' ? 'plan' : props.fullAccess ? 'full' : 'ask'
  const setMode = (next: 'default' | 'plan'): void => {
    void window.api.chatEngine
      .control(props.threadId, { action: 'setPermissionMode', mode: next })
      .catch(() => undefined)
  }
  const pick = (next: AccessChoice): void => {
    if (next === 'plan') {
      setMode('plan')
      return
    }
    if (mode === 'plan') {
      setMode('default')
    }
    props.onSetFullAccess(next === 'full')
  }
  const labels: Record<AccessChoice, string> = {
    ask: translate('components.chat-conversation.access.ask', 'Ask first'),
    full: translate('components.chat-conversation.access.full', 'Full access'),
    plan: translate('components.chat-conversation.access.plan', 'Plan first')
  }
  const Icon = choice === 'full' ? ShieldAlert : choice === 'plan' ? ListChecks : ShieldCheck
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-access={choice}
              aria-label={translate(
                'components.chat-conversation.access.value',
                'Tool access: {{value}}',
                { value: labels[choice] }
              )}
              className={cn(CHAT_CONVERSATION_ICON_CLASS, choice === 'full' && 'text-destructive')}
            >
              <Icon className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {labels[choice]}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top">
        <AccessItem
          checked={choice === 'ask'}
          label={labels.ask}
          hint={translate(
            'components.chat-conversation.access.askHint',
            'Every tool needs your approval'
          )}
          onSelect={() => pick('ask')}
        />
        <AccessItem
          checked={choice === 'full'}
          label={labels.full}
          hint={translate(
            'components.chat-conversation.access.fullHint',
            'Runs every tool without asking'
          )}
          onSelect={() => pick('full')}
        />
        <AccessItem
          checked={choice === 'plan'}
          label={labels.plan}
          hint={translate(
            'components.chat-conversation.access.planHint',
            'Reads and plans, then asks before changing anything'
          )}
          onSelect={() => pick('plan')}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ChatWebAccessToggle(props: { threadId: string }): React.JSX.Element {
  const blocked = useAppStore((s) => s.chatThreadWebBlocked[props.threadId] === true)
  const setBlocked = useAppStore((s) => s.setChatThreadWebBlocked)
  const label = blocked
    ? translate('components.chat-conversation.web.off', 'Web access off')
    : translate('components.chat-conversation.web.on', 'Web access on')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={!blocked}
          aria-label={translate('components.chat-conversation.web.toggle', 'Web access')}
          onClick={() => setBlocked(props.threadId, !blocked)}
          className={CHAT_CONVERSATION_ICON_CLASS}
        >
          {blocked ? <GlobeLock className="size-4" /> : <Globe className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
