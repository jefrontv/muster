// The composer mic. Set up, it toggles (or holds) dictation into the textarea;
// without a speech model it stays visible and explains what it needs.

import { Mic, Square } from 'lucide-react'
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

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
          className="pointer-coarse:size-11"
        >
          <Mic className="size-4" />
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
  return (
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
          className="pointer-coarse:size-11"
        >
          {isDictating ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
