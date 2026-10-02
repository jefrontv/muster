import { ArrowUp, Check, ChevronDown, ShieldAlert, ShieldQuestion, Square } from 'lucide-react'
import * as React from 'react'
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
import { NativeChatTaskPickerMenu } from './NativeChatTaskPickerMenu'
import type { NativeChatTaskAttachment } from './use-native-chat-task-attachments'
import {
  CONTEXT_WINDOW_MAX_TOKENS,
  NativeChatContextWindowMeter
} from './NativeChatContextWindowMeter'
import type { NativeChatPromptStash } from './use-native-chat-prompt-stash'
import { NativeChatMicButton } from './NativeChatMicButton'
import { useNativeChatSurface } from './native-chat-surface-context'
import type { NativeChatDictation } from './use-native-chat-dictation'

/** The donut stays out of the way until half the window is used. */
export const CONTEXT_METER_MIN_FRACTION = 0.5

export type NativeChatComposerActionsProps = {
  attachDisabled: boolean
  dictationDisabled: boolean
  dictation: NativeChatDictation
  sendDisabled: boolean
  isWorking: boolean
  onAttach: () => void
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
  onAttachTask?: (task: NativeChatTaskAttachment) => void
  activeCollabProjectId?: number | null
}

export function NativeChatComposerActions({
  attachDisabled,
  dictationDisabled,
  dictation,
  sendDisabled,
  isWorking,
  onAttach,
  onSend,
  onStop,
  sessionOptionsSurface,
  sessionOptionsSnapshot,
  stash,
  contextUsedTokens,
  contextMaxTokens,
  fullAccess,
  onSetFullAccess,
  onAttachTask,
  activeCollabProjectId
}: NativeChatComposerActionsProps): React.JSX.Element {
  // One slot for every picker on this bar (thought level / model / access), so opening one closes
  // whichever was open instead of stacking a second panel over it.
  const [openPicker, setOpenPicker] = React.useState<string | null>(null)
  const { chatThread, reportedModel } = useNativeChatSurface()
  const showMeter =
    contextUsedTokens !== null &&
    contextUsedTokens /
      Math.max(contextMaxTokens ?? CONTEXT_WINDOW_MAX_TOKENS, contextUsedTokens) >=
      CONTEXT_METER_MIN_FRACTION
  const accessLabel = fullAccess
    ? translate('auto.components.native-chat.composer.fullAccess', 'Full access')
    : translate('auto.components.native-chat.composer.askFirst', 'Ask first')
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-0.5">
        <NativeChatStashMenu stash={stash} attachDisabled={attachDisabled} onAttach={onAttach} />
        {onAttachTask ? (
          <NativeChatTaskPickerMenu
            onAttachTask={onAttachTask}
            preferredProjectId={activeCollabProjectId}
          />
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <NativeChatSessionOptionPickers
          surface={sessionOptionsSurface}
          snapshot={sessionOptionsSnapshot}
          isWorking={isWorking}
          openPicker={openPicker}
          onOpenPickerChange={setOpenPicker}
          chatThread={chatThread}
          reportedModel={reportedModel}
        />
        {onSetFullAccess ? (
          <DropdownMenu
            open={openPicker === 'access'}
            onOpenChange={(open) => setOpenPicker(open ? 'access' : null)}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  {/* Quiet icon while tools ask first; the label only shows when Full access is on. */}
                  <button
                    type="button"
                    aria-label={translate(
                      'components.native-chat.composer.accessLevelValue',
                      'Tool access: {{value}}',
                      { value: accessLabel }
                    )}
                    className={
                      fullAccess
                        ? 'flex h-7 items-center gap-1.5 rounded-md border border-border bg-accent pl-2 pr-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/80'
                        : 'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground'
                    }
                  >
                    {fullAccess ? (
                      <>
                        <ShieldAlert className="size-3.5 text-destructive" />
                        {accessLabel}
                        <ChevronDown className="size-3 opacity-70" />
                      </>
                    ) : (
                      <ShieldQuestion className="size-4" />
                    )}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {accessLabel}
              </TooltipContent>
            </Tooltip>
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
        {showMeter && contextUsedTokens !== null ? (
          <NativeChatContextWindowMeter
            usedTokens={contextUsedTokens}
            maxTokens={contextMaxTokens}
          />
        ) : null}
        <NativeChatMicButton
          configured={dictation.configured}
          isDictating={dictation.isDictating}
          isHoldMode={dictation.isHoldMode}
          disabled={dictationDisabled}
          onToggle={dictation.toggle}
          onHoldStart={dictation.holdStart}
          onHoldEnd={dictation.holdEnd}
          onSetUp={dictation.openSetup}
        />
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
          className="ml-0.5 size-8 rounded-full pointer-coarse:size-10"
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
