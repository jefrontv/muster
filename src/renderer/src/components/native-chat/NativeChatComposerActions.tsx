import {
  ArrowUp,
  Check,
  ChevronDown,
  Mic,
  Plus,
  ShieldAlert,
  ShieldQuestion,
  Square
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type {
  SessionOptionDescriptor,
  SessionOptionsSurface
} from '../../../../shared/native-chat-session-options'
import { NativeChatSessionOptionPickers } from './NativeChatSessionOptionPickers'
import { NativeChatStashMenu } from './NativeChatStashMenu'
import { NativeChatContextWindowMeter } from './NativeChatContextWindowMeter'
import type { NativeChatPromptStash } from './use-native-chat-prompt-stash'

export type NativeChatComposerActionsProps = {
  attachDisabled: boolean
  dictationDisabled: boolean
  /** False = voice not set up; the mic routes to settings and says so. */
  dictationConfigured?: boolean
  sendDisabled: boolean
  isWorking: boolean
  isDictating: boolean
  isDictationHoldMode: boolean
  onAttach: () => void
  onDictationToggle: () => void
  onDictationHoldStart: () => void
  onDictationHoldEnd: () => void
  onSend: () => void
  onStop?: () => void
  sessionOptionsSurface: SessionOptionsSurface | null
  sessionOptionsSnapshot: SessionOptionDescriptor[]
  stash: NativeChatPromptStash
  /** Context-window donut input; null hides the meter. */
  contextUsedTokens: number | null
  contextMaxTokens?: number
  /** Full-access session (auto-approve all tools); click turns it off. */
  fullAccess?: boolean
  onSetFullAccess?: (enabled: boolean) => void
}

export function NativeChatComposerActions({
  attachDisabled,
  dictationDisabled,
  dictationConfigured = true,
  sendDisabled,
  isWorking,
  isDictating,
  isDictationHoldMode,
  onAttach,
  onDictationToggle,
  onDictationHoldStart,
  onDictationHoldEnd,
  onSend,
  onStop,
  sessionOptionsSurface,
  sessionOptionsSnapshot,
  stash,
  contextUsedTokens,
  contextMaxTokens,
  fullAccess,
  onSetFullAccess
}: NativeChatComposerActionsProps): React.JSX.Element {
  const dictationLabel = !dictationConfigured
    ? translate(
        'auto.components.native-chat.composer.setUpDictation',
        'Set up voice dictation in Settings'
      )
    : isDictating
      ? translate('components.native-chat.composer.stopDictation', 'Stop dictation')
      : translate('components.native-chat.composer.startDictation', 'Start dictation')
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={translate('components.native-chat.composer.attach', 'Attach file')}
              disabled={attachDisabled}
              onClick={onAttach}
              className="pointer-coarse:size-11"
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {translate('components.native-chat.composer.attach', 'Attach file')}
          </TooltipContent>
        </Tooltip>
        <NativeChatStashMenu stash={stash} />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {/* Why: keep session controls beside the actions they affect; the
        model trigger is ordered last so it sits directly next to dictation. */}
        <NativeChatSessionOptionPickers
          surface={sessionOptionsSurface}
          snapshot={sessionOptionsSnapshot}
          isWorking={isWorking}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isDictating ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={dictationLabel}
              disabled={dictationDisabled}
              onClick={isDictationHoldMode ? undefined : onDictationToggle}
              onPointerDown={(event) => {
                if (!isDictationHoldMode || dictationDisabled) {
                  return
                }
                event.preventDefault()
                onDictationHoldStart()
              }}
              onPointerUp={() => {
                if (isDictationHoldMode && !dictationDisabled) {
                  onDictationHoldEnd()
                }
              }}
              onPointerCancel={() => {
                if (isDictationHoldMode && !dictationDisabled) {
                  onDictationHoldEnd()
                }
              }}
              onPointerLeave={(event) => {
                if (isDictationHoldMode && event.buttons === 1 && !dictationDisabled) {
                  onDictationHoldEnd()
                }
              }}
              className="pointer-coarse:size-11"
            >
              {isDictating ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {dictationLabel}
          </TooltipContent>
        </Tooltip>
        {onSetFullAccess ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={translate(
                  'auto.components.native-chat.composer.accessLevel',
                  'Tool access level'
                )}
                className={
                  fullAccess
                    ? 'flex h-7 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 pl-2.5 pr-2 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20'
                    : 'flex h-7 items-center gap-1.5 rounded-full border border-border/70 pl-2.5 pr-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground'
                }
              >
                {fullAccess ? (
                  <ShieldAlert className="size-3.5" />
                ) : (
                  <ShieldQuestion className="size-3.5" />
                )}
                {fullAccess
                  ? translate('auto.components.native-chat.composer.fullAccess', 'Full access')
                  : translate('auto.components.native-chat.composer.askFirst', 'Ask first')}
                <ChevronDown className="size-3 text-muted-foreground/70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem onSelect={() => onSetFullAccess(false)}>
                <Check className={fullAccess ? 'size-4 opacity-0' : 'size-4'} />
                <span className="flex flex-col gap-0.5">
                  <span>
                    {translate('auto.components.native-chat.composer.askFirstItem', 'Ask first')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {translate(
                      'auto.components.native-chat.composer.askFirstHint',
                      'Every tool needs your approval'
                    )}
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSetFullAccess(true)}>
                <Check className={fullAccess ? 'size-4' : 'size-4 opacity-0'} />
                <span className="flex flex-col gap-0.5">
                  <span>
                    {translate(
                      'auto.components.native-chat.composer.fullAccessItem',
                      'Full access'
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {translate(
                      'auto.components.native-chat.composer.fullAccessItemHint',
                      'Runs every tool without asking — remembered for all chats'
                    )}
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {contextUsedTokens !== null ? (
          <NativeChatContextWindowMeter
            usedTokens={contextUsedTokens}
            maxTokens={contextMaxTokens}
          />
        ) : null}
        <Button
          type="button"
          aria-label={
            isWorking
              ? translate('components.native-chat.stop', 'Stop the agent')
              : translate('components.native-chat.composer.send', 'Send')
          }
          disabled={sendDisabled}
          onClick={isWorking ? onStop : onSend}
          variant={isWorking ? 'secondary' : 'default'}
          size="icon"
          className="ml-1.5 size-8 rounded-full pointer-coarse:size-10"
        >
          {isWorking ? (
            <Square className="size-3.5 fill-current" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
