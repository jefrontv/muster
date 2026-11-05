// The composer mic: a filled waveform button with a voice options chevron. Set up, it toggles
// (or holds) dictation into the textarea; without a speech model it explains what it needs.

import { AudioLines, ChevronDown, Square } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { CHAT_CONVERSATION_FILLED_ICON_CLASS } from './chat-seat-composer-classes'

export type NativeChatMicButtonProps = {
  configured: boolean
  isDictating: boolean
  isHoldMode: boolean
  disabled?: boolean
  onToggle: () => void
  onHoldStart: () => void
  onHoldEnd: () => void
  onSetUp: () => void
}

function SetUpMic({ onSetUp }: { onSetUp: () => void }): React.JSX.Element {
  const label = translate('components.native-chat.composer.voiceTyping', 'Voice typing')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={CHAT_CONVERSATION_FILLED_ICON_CLASS}
        >
          <AudioLines className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 space-y-2 p-3 text-sm">
        <p>
          {translate(
            'components.native-chat.composer.voiceNeedsModel',
            'Voice typing needs a speech model'
          )}
        </p>
        <Button type="button" size="sm" onClick={onSetUp}>
          {translate('components.native-chat.composer.voiceSetUp', 'Set up')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export function NativeChatMicButton({
  configured,
  isDictating,
  isHoldMode,
  disabled = false,
  onToggle,
  onHoldStart,
  onHoldEnd,
  onSetUp
}: NativeChatMicButtonProps): React.JSX.Element {
  if (!configured) {
    return <SetUpMic onSetUp={onSetUp} />
  }
  const label = isDictating
    ? translate('components.native-chat.composer.stopDictation', 'Stop dictation')
    : translate('components.native-chat.composer.startDictation', 'Start dictation')
  const holding = isHoldMode && !disabled
  const button = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={isDictating ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={isHoldMode ? undefined : onToggle}
          onPointerDown={(event) => {
            if (!holding) {
              return
            }
            event.preventDefault()
            onHoldStart()
          }}
          onPointerUp={() => holding && onHoldEnd()}
          onPointerCancel={() => holding && onHoldEnd()}
          onPointerLeave={(event) => {
            if (holding && event.buttons === 1) {
              onHoldEnd()
            }
          }}
          className={cn(
            CHAT_CONVERSATION_FILLED_ICON_CLASS,
            isDictating && 'bg-chat-accent text-background'
          )}
        >
          {isDictating ? (
            <Square className="size-3.5 fill-current" />
          ) : (
            <AudioLines className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
  return (
    <div className="flex items-center gap-1">
      {button}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={translate('components.native-chat.composer.voiceOptions', 'Voice options')}
            className={CHAT_CONVERSATION_FILLED_ICON_CLASS}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem onSelect={onSetUp}>
            {translate('components.native-chat.composer.voiceSettings', 'Voice settings')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
