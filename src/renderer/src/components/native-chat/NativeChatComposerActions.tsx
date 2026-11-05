import * as React from 'react'
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
import { NativeChatSeatSendButton } from './NativeChatSeatSendButton'
import {
  CHAT_CONVERSATION_LEAD_CLASS,
  CHAT_CONVERSATION_TRAIL_CLASS
} from './chat-seat-composer-classes'

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
  onAttachTask,
  activeCollabProjectId
}: NativeChatComposerActionsProps): React.JSX.Element {
  // One slot for every picker on this bar (thought level / model / access), so opening one closes
  // whichever was open instead of stacking a second panel over it.
  const [openPicker, setOpenPicker] = React.useState<string | null>(null)
  const { chatThread, reportedModel, composerLeadSlot } = useNativeChatSurface()
  const showMeter =
    contextUsedTokens !== null &&
    contextUsedTokens /
      Math.max(contextMaxTokens ?? CONTEXT_WINDOW_MAX_TOKENS, contextUsedTokens) >=
      CONTEXT_METER_MIN_FRACTION
  const sendLabel = isWorking
    ? translate('components.native-chat.stop', 'Stop the agent')
    : translate('components.native-chat.composer.send', 'Send')
  const stashMenu = (
    <NativeChatStashMenu stash={stash} attachDisabled={attachDisabled} onAttach={onAttach} />
  )
  const taskMenu = onAttachTask ? (
    <NativeChatTaskPickerMenu
      onAttachTask={onAttachTask}
      preferredProjectId={activeCollabProjectId}
    />
  ) : null
  const optionPickers = (
    <NativeChatSessionOptionPickers
      surface={sessionOptionsSurface}
      snapshot={sessionOptionsSnapshot}
      isWorking={isWorking}
      openPicker={openPicker}
      onOpenPickerChange={setOpenPicker}
      chatThread={chatThread}
      reportedModel={reportedModel}
    />
  )
  const contextMeter =
    showMeter && contextUsedTokens !== null ? (
      <NativeChatContextWindowMeter usedTokens={contextUsedTokens} maxTokens={contextMaxTokens} />
    ) : null
  const micButton = (
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
  )
  return (
    <>
      <div className={CHAT_CONVERSATION_LEAD_CLASS}>
        {stashMenu}
        {taskMenu}
        {composerLeadSlot}
      </div>
      <div className={CHAT_CONVERSATION_TRAIL_CLASS}>
        {optionPickers}
        {contextMeter}
        {micButton}
        <NativeChatSeatSendButton
          stop={isWorking}
          label={sendLabel}
          disabled={sendDisabled}
          onClick={isWorking ? onStop : onSend}
        />
      </div>
    </>
  )
}
