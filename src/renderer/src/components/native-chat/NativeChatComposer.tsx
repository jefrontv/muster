import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { getVerifiedNativeChatCommands } from '../../../../shared/native-chat-agent-profiles'
import {
  applyMentionSuggestion,
  EMPTY_HISTORY,
  type HistoryState
} from './native-chat-composer-state'
import { readNativeChatDraftCache } from './native-chat-draft-cache'
import { useNativeChatDraft } from './use-native-chat-draft'
import { NativeChatComposerField } from './NativeChatComposerField'
import type { NativeChatResolvedTarget } from './native-chat-composer-target'
import type { NativeChatComposerApproval } from './NativeChatApprovalPanel'
import { useNativeChatComposerAttachments } from './use-native-chat-composer-attachments'
import { useNativeChatComposerPaste } from './use-native-chat-composer-paste'
import { useNativeChatExternalAttachments } from './use-native-chat-external-attachments'
import { useNativeChatComposerKeyDown } from './use-native-chat-composer-keydown'
import { useNativeChatSendLifecycle } from './use-native-chat-send-lifecycle'
import { useNativeChatSessionOptions } from './use-native-chat-session-options'
import { useNativeChatFileAttachmentActions } from './use-native-chat-file-attachment-actions'
import { useNativeChatDictationActions } from './use-native-chat-dictation-actions'
import { useNativeChatSessionOptionCommand } from './use-native-chat-session-option-command'
import { useNativeChatPickerState } from './use-native-chat-picker-state'
import { useNativeChatPickerCommandDispatch } from './use-native-chat-picker-command-dispatch'
import { useNativeChatTransportSend } from './use-native-chat-transport-send'
import { useNativeChatTypedInsertion } from './use-native-chat-typed-insertion'
import { useNativeChatComposerSend } from './use-native-chat-composer-send'
import { useNativeChatPromptStash } from './use-native-chat-prompt-stash'
import { useNativeChatContextUsage } from './use-native-chat-context-usage'
import type {
  NativeChatComposerHandle,
  NativeChatComposerProps
} from './native-chat-composer-types'

export type {
  NativeChatComposerHandle,
  NativeChatComposerProps
} from './native-chat-composer-types'

/**
 * Rich native input for the chat view. Sends prompts into the running agent
 * through the same verified runtime path as typed input (KTD4), so the agent
 * cannot distinguish native input from keystrokes. Enter sends; Shift+Enter
 * inserts a newline; multi-line is bracketed-paste wrapped; Esc interrupts.
 * Slash-command and `@file` autocomplete are agent-aware; image paste persists a
 * temp file and injects the agent-appropriate path (or reports unsupported).
 */
export const NativeChatComposer = forwardRef<NativeChatComposerHandle, NativeChatComposerProps>(
  function NativeChatComposer(
    {
      terminalTabId,
      paneKey,
      targetPtyId,
      agent,
      transportSend,
      transportDispatchOption,
      transportInterrupt,
      canSend = true,
      isWorking = false,
      onStop,
      onOptimisticSend,
      onOptimisticSendCanceled,
      onSlashCommand,
      onSwitchToTerminal,
      readTerminalScreen,
      permissionRequest,
      permissionRequestCount,
      onRespondPermission,
      contextUsageEnabled = false,
      contextMaxTokens
    },
    ref
  ): React.JSX.Element {
    // Scope key shared with image attachments so an unsent draft + its attached
    // images survive both TUI/GUI toggles and PTY replacement on reconnect.
    // Why: local, SSH, and runtime reconnects can replace or temporarily clear
    // the PTY id. Pane identity is the stable ownership key for unsent input.
    const draftScopeKey = paneKey
    const { draft, setDraft } = useNativeChatDraft(draftScopeKey)
    const [caret, setCaret] = useState(draft.length)
    const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY)
    const [activeSuggestion, setActiveSuggestion] = useState(0)
    const [notice, setNotice] = useState<string | null>(null)
    const [dictationPressed, setDictationPressed] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const isComposingRef = useRef(false)
    const { cancelPendingSends, trackPendingSend } = useNativeChatSendLifecycle(
      terminalTabId,
      targetPtyId,
      onOptimisticSendCanceled
    )
    const dictationState = useAppStore((store) => store.dictationState)
    const voiceSettings = useAppStore((store) => store.settings?.voice)
    const isDictationHoldMode = voiceSettings?.dictationMode === 'hold'
    const dictationDisabled = voiceSettings?.enabled !== true || !voiceSettings.sttModel
    const isDictating =
      dictationPressed ||
      dictationState === 'starting' ||
      dictationState === 'listening' ||
      dictationState === 'stopping'

    // Place the caret at the end of the (possibly restored) draft when the
    // composer is reused for a different pane. Adjusted during render (matching
    // the draft reload) so caret and text stay consistent on the first paint.
    const lastDraftScopeKey = useRef(draftScopeKey)
    if (lastDraftScopeKey.current !== draftScopeKey) {
      lastDraftScopeKey.current = draftScopeKey
      setCaret(readNativeChatDraftCache(draftScopeKey).length)
    }

    const agentCommands = useMemo(() => getVerifiedNativeChatCommands(agent), [agent])
    const picker = useNativeChatPickerState({
      agent,
      terminalTabId,
      draftScopeKey,
      draft,
      caret,
      agentCommands,
      textareaRef,
      setDraft,
      setCaret,
      setActiveSuggestion
    })
    const {
      autocomplete,
      classifySend,
      clearSkillOrigin,
      completeItem,
      dismiss,
      handleDraftOrCaretChange
    } = picker

    // Resolve the live ptyId for this chat leaf; runtime owner settings route
    // local vs remote (SSH) sends.
    const resolveTarget = useCallback((): NativeChatResolvedTarget | null => {
      if (!targetPtyId) {
        return null
      }
      return { ptyId: targetPtyId, settings: getSettingsForAgentTabRuntimeOwner(terminalTabId) }
    }, [targetPtyId, terminalTabId])

    const hasTransport = transportSend !== undefined
    const [hasPty, disabled] = [
      targetPtyId !== null || hasTransport,
      (targetPtyId === null && !hasTransport) || !canSend
    ]

    const syncCaret = useCallback((el: HTMLTextAreaElement) => {
      setCaret(el.selectionStart ?? el.value.length)
    }, [])

    const {
      imageAttachments,
      fileAttachments,
      attachResolvedPaths,
      clearImageAttachments,
      removeImageAttachment,
      removeFileAttachment
    } = useNativeChatComposerAttachments({
      attachmentScopeKey: paneKey,
      hasTransport,
      resolveTarget,
      textareaRef,
      setNotice
    })
    const sendButtonDisabled = isWorking
      ? !hasPty || !onStop
      : disabled ||
        (draft.trim() === '' && imageAttachments.length === 0 && fileAttachments.length === 0)

    const { insertTypedText, focus } = useNativeChatTypedInsertion({
      textareaRef,
      caret,
      draft,
      setDraft,
      setCaret,
      setHistory,
      setActiveSuggestion
    })

    const { attachExternalPaths, resolveAttachmentOwner } = useNativeChatExternalAttachments({
      terminalTabId,
      disabled,
      // Stream threads run a local headless child — there is no worktree to
      // resolve, and images ride the message as base64 blocks.
      transportLocal: hasTransport,
      attachResolvedPaths,
      setNotice
    })

    const { handlePaste, pasteFromClipboard } = useNativeChatComposerPaste({
      agent,
      disabled,
      caret,
      resolveAttachmentOwner,
      attachResolvedPaths,
      insertTypedText,
      setCaret,
      setNotice
    })

    useImperativeHandle(
      ref,
      () => ({ focus, insertTypedText, handlePasteEvent: handlePaste, pasteFromClipboard }),
      [focus, insertTypedText, handlePaste, pasteFromClipboard]
    )

    const { pickAttachment } = useNativeChatFileAttachmentActions(attachExternalPaths)
    const { toggleDictation, startHoldDictation, stopHoldDictation } =
      useNativeChatDictationActions({ textareaRef, setDictationPressed })
    const { dispatch: dispatchSessionOptionCommand, isDispatching: isDispatchingSessionOption } =
      useNativeChatSessionOptionCommand({
        agent,
        disabled,
        onSlashCommand,
        resolveTarget,
        setHistory
      })

    const { surface: sessionOptionsSurface, snapshot: sessionOptionsSnapshot } =
      useNativeChatSessionOptions({
        agent,
        terminalTabId,
        targetPtyId,
        hasTransport,
        // Stream threads restart the child with new launch flags instead of
        // typing a slash command into a PTY.
        dispatchCommand: transportDispatchOption ?? dispatchSessionOptionCommand,
        onAgentPicker: onSwitchToTerminal,
        readTerminalScreen
      })

    const sendViaTransport = useNativeChatTransportSend({
      agent,
      transportSend,
      onOptimisticSend,
      onOptimisticSendCanceled,
      setHistory,
      setDraft,
      setCaret,
      clearSkillOrigin,
      setNotice
    })

    const imageAttachmentPaths = useMemo(
      () => imageAttachments.map((attachment) => attachment.path),
      [imageAttachments]
    )
    const fileAttachmentPaths = useMemo(
      () => fileAttachments.map((attachment) => attachment.path),
      [fileAttachments]
    )
    const { send, interrupt } = useNativeChatComposerSend({
      agent,
      draft,
      imageAttachmentPaths,
      fileAttachmentPaths,
      disabled,
      hasTransport,
      isWorking,
      isDispatchingSessionOption,
      classifySend,
      resolveTarget,
      sendViaTransport,
      cancelPendingSends,
      trackPendingSend,
      transportInterrupt,
      onStop,
      onOptimisticSend,
      onSlashCommand,
      sessionOptionsSurface,
      clearSkillOrigin,
      clearImageAttachments,
      setHistory,
      setDraft,
      setCaret,
      setNotice
    })

    const stash = useNativeChatPromptStash({ draft, setDraft, setCaret, textareaRef })
    const contextUsedTokens = useNativeChatContextUsage({
      paneKey,
      agent,
      isWorking,
      enabled: contextUsageEnabled
    })

    // Oldest queued permission request owns the composer until answered.
    const approval = useMemo<NativeChatComposerApproval | null>(() => {
      if (!permissionRequest || !onRespondPermission) {
        return null
      }
      return {
        request: permissionRequest,
        count: permissionRequestCount ?? 1,
        respond: onRespondPermission,
        cancelTurn: () => {
          onStop?.()
          // Interrupting the turn also cancels the question CLI-side.
          void transportInterrupt?.()
        }
      }
    }, [permissionRequest, permissionRequestCount, onRespondPermission, onStop, transportInterrupt])

    const dispatchPickerCommand = useNativeChatPickerCommandDispatch({
      agent,
      disabled,
      isDispatchingSessionOption,
      resolveTarget,
      onSlashCommand,
      sessionOptionsSurface,
      trackPendingSend,
      setHistory,
      setDraft,
      setCaret,
      setActiveSuggestion,
      clearSkillOrigin,
      clearImageAttachments,
      setNotice
    })

    const handleKeyDown = useNativeChatComposerKeyDown({
      autocomplete,
      activeSuggestion,
      draft,
      history,
      isComposing: () => isComposingRef.current,
      completePickerItem: completeItem,
      dispatchPickerCommand,
      dismissPicker: dismiss,
      interrupt,
      send,
      setActiveSuggestion,
      setDraft,
      setCaret,
      setHistory
    })
    const stashHandleKeyDown = stash.handleKeyDown
    const handleKeyDownWithStash = useCallback<typeof handleKeyDown>(
      (event) => {
        // The stash chord wins over history/send handling when it consumes the key.
        if (stashHandleKeyDown(event)) {
          return
        }
        handleKeyDown(event)
      },
      [stashHandleKeyDown, handleKeyDown]
    )

    return (
      <NativeChatComposerField
        textareaRef={textareaRef}
        draft={draft}
        disabled={disabled}
        hasPty={hasPty}
        canSend={canSend}
        autocomplete={autocomplete}
        activeSuggestion={activeSuggestion}
        notice={notice}
        imageAttachments={imageAttachments}
        fileAttachments={fileAttachments}
        sendButtonDisabled={sendButtonDisabled}
        isWorking={isWorking}
        attachDisabled={disabled}
        dictationDisabled={dictationDisabled}
        isDictating={isDictating}
        isDictationHoldMode={isDictationHoldMode}
        onDraftChange={(value, element) => {
          setDraft(value)
          setHistory((prev) => ({ entries: prev.entries, index: null }))
          syncCaret(element)
          handleDraftOrCaretChange(value, element.selectionStart ?? value.length)
          setActiveSuggestion(0)
        }}
        onTextareaSelect={(element) => {
          syncCaret(element)
          handleDraftOrCaretChange(element.value, element.selectionStart ?? element.value.length)
          setActiveSuggestion(0)
        }}
        onKeyDown={handleKeyDownWithStash}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
        }}
        onPaste={handlePaste}
        pickerListboxId={picker.listboxId}
        onChoosePickerItem={completeItem}
        onRetrySkills={picker.retrySkills}
        onAcceptMention={() => {
          if (autocomplete.mode !== 'mention') {
            return
          }
          const result = applyMentionSuggestion(draft, caret, autocomplete.query)
          setDraft(result.draft)
          setCaret(result.caret)
          const textarea = textareaRef.current
          textarea?.focus()
          requestAnimationFrame(() => textarea?.setSelectionRange(result.caret, result.caret))
        }}
        onRemoveImageAttachment={(id) => removeImageAttachment(id)}
        onRemoveFileAttachment={(id) => removeFileAttachment(id)}
        onAttach={pickAttachment}
        onDictationToggle={toggleDictation}
        onDictationHoldStart={startHoldDictation}
        onDictationHoldEnd={stopHoldDictation}
        onSend={send}
        onStop={interrupt}
        sessionOptionsSurface={sessionOptionsSurface}
        sessionOptionsSnapshot={sessionOptionsSnapshot}
        approval={approval}
        stash={stash}
        contextUsedTokens={contextUsedTokens}
        contextMaxTokens={contextMaxTokens}
      />
    )
  }
)
