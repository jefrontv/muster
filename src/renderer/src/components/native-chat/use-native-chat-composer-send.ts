// The composer's send and interrupt callbacks, extracted whole from
// NativeChatComposer so the component stays within the file-size budget.

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import {
  sendNativeChatMessage,
  sendNativeChatMessageWithImageAttachments,
  submitNativeChatPrompt,
  type NativeChatSendHandle
} from './native-chat-runtime-send'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import { pushHistory, type HistoryState } from './native-chat-composer-state'
import type { NativeChatSendClassification } from './native-chat-picker-items'
import {
  formatNativeChatFileReference,
  nativeChatComposerTargetIsRemote,
  type NativeChatResolvedTarget
} from './native-chat-composer-target'
import type { NativeChatPtySessionOptionsSurface } from './native-chat-pty-session-options'
import type { AgentType } from '../../../../shared/agent-status-types'
import { formatActiveCollabTaskReference } from './native-chat-activecollab-references'
import type { NativeChatTaskAttachment } from './use-native-chat-task-attachments'

// Why: a plain ESC byte is what the agent TUIs read as the interrupt key over a
// PTY (matching how xterm forwards Escape). The richer interrupt-intent
// inference (agent-interrupt-intent.ts) is driven by the existing PTY input
// observers, so writing ESC through the same send path feeds that machinery.
const ESC = '\x1b'

export type UseNativeChatComposerSendArgs = {
  agent: AgentType
  draft: string
  imageAttachmentPaths: string[]
  /** Non-image attachments, appended to the outgoing text as @-references. */
  fileAttachmentPaths: string[]
  /** Attached ActiveCollab tasks, appended as AC# reference lines with MCP context. */
  taskAttachments: NativeChatTaskAttachment[]
  clearTaskAttachments: () => void
  disabled: boolean
  hasTransport: boolean
  isWorking: boolean
  isDispatchingSessionOption: boolean
  classifySend: (text: string) => NativeChatSendClassification
  resolveTarget: () => NativeChatResolvedTarget | null
  sendViaTransport: (text: string, imagePaths?: string[]) => void
  cancelPendingSends: () => void
  trackPendingSend: (handle: NativeChatSendHandle, pendingId?: string) => void
  transportInterrupt?: () => Promise<boolean>
  onStop?: () => void
  onOptimisticSend?: (text: string, imagePaths?: string[]) => string | undefined
  onSlashCommand?: (command: string) => void
  sessionOptionsSurface: NativeChatPtySessionOptionsSurface | null
  clearSkillOrigin: () => void
  clearImageAttachments: () => void
  setHistory: Dispatch<SetStateAction<HistoryState>>
  setDraft: (next: string) => void
  setCaret: Dispatch<SetStateAction<number>>
  setNotice: (notice: string | null) => void
}

export function useNativeChatComposerSend(args: UseNativeChatComposerSendArgs): {
  send: () => void
  interrupt: () => void
} {
  const {
    agent,
    draft,
    imageAttachmentPaths,
    fileAttachmentPaths,
    taskAttachments,
    clearTaskAttachments,
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
  } = args

  const send = useCallback(() => {
    // File and task chips become references appended after the typed text, so
    // the agent can read them while the composer shows clean chips instead.
    const fileReferences = fileAttachmentPaths.map(formatNativeChatFileReference).join(' ')
    const taskReferences = taskAttachments.map(formatActiveCollabTaskReference).join('\n')
    const references = [fileReferences, taskReferences].filter(Boolean).join('\n')
    const text = references ? `${draft.trimEnd()}${draft.trim() ? '\n' : ''}${references}` : draft
    const imagePaths = imageAttachmentPaths
    if ((text.trim() === '' && imagePaths.length === 0) || disabled) {
      return
    }
    // Why: block a normal send while a session-option command (e.g. /model) is
    // still writing its body+delayed-Enter to the same pty, so the two write
    // sequences can't interleave on one input line.
    if (isDispatchingSessionOption) {
      return
    }
    if (hasTransport) {
      // Stream transport: plain user turns (with optional images as base64
      // content blocks). Slash/skill sends still have no headless path.
      if (classifySend(text) !== 'chat') {
        setNotice('Commands are not supported in chat threads yet — use the pickers below.')
        return
      }
      sendViaTransport(text, imagePaths.length > 0 ? imagePaths : undefined)
      clearImageAttachments()
      clearTaskAttachments()
      return
    }
    const target = resolveTarget()
    if (!target) {
      return
    }
    const classification = classifySend(text)
    let pendingHandle: NativeChatSendHandle | null = null
    // Why: image attachments take the attachment send path even for a
    // command/unknown send, otherwise `clearImageAttachments()` below drops
    // them silently when the text starts with the agent's slash/skill prefix.
    if (classification !== 'chat' && imagePaths.length === 0) {
      pendingHandle = sendNativeChatMessage(target.settings, target.ptyId, text)
    } else if (imagePaths.length > 0) {
      pendingHandle = sendNativeChatMessageWithImageAttachments(
        target.settings,
        target.ptyId,
        text,
        imagePaths
      )
    } else if (text.trim().length > 0) {
      pendingHandle = sendNativeChatMessage(target.settings, target.ptyId, text)
    } else {
      submitNativeChatPrompt(target.settings, target.ptyId)
    }
    if (classification !== 'chat') {
      if (pendingHandle) {
        trackPendingSend(pendingHandle)
      }
      // Why: only verified catalog commands can truthfully claim they ran or
      // mutate session-option state; unknown slash-like text has no such proof.
      if (classification === 'command') {
        onSlashCommand?.(text.trim())
        sessionOptionsSurface?.recordOutgoingCommand(text.trim())
      }
    } else {
      const pendingId = onOptimisticSend?.(text, imagePaths)
      if (pendingHandle) {
        trackPendingSend(pendingHandle, pendingId)
      }
    }
    // Why: U10 telemetry — record adoption + local-vs-remote runtime split. The
    // agent prop is the loose AgentType; the emitter narrows unknowns to 'other'.
    emitNativeChatMessageSent({
      agent,
      runtime: nativeChatComposerTargetIsRemote(target.ptyId) ? 'remote' : 'local'
    })
    setHistory((prev) => pushHistory(prev, text))
    setDraft('')
    setCaret(0)
    clearSkillOrigin()
    clearImageAttachments()
    clearTaskAttachments()
    setNotice(null)
  }, [
    agent,
    classifySend,
    clearSkillOrigin,
    clearImageAttachments,
    draft,
    imageAttachmentPaths,
    fileAttachmentPaths,
    taskAttachments,
    clearTaskAttachments,
    disabled,
    hasTransport,
    isDispatchingSessionOption,
    resolveTarget,
    onOptimisticSend,
    onSlashCommand,
    sendViaTransport,
    sessionOptionsSurface,
    trackPendingSend,
    setCaret,
    setDraft,
    setHistory,
    setNotice
  ])

  const interrupt = useCallback(() => {
    cancelPendingSends()
    if (isWorking && (onStop || transportInterrupt)) {
      onStop?.()
      // Real stream interrupt; onStop only cleans renderer-side echo state.
      void transportInterrupt?.()
      return
    }
    // Why: no PTY means no ESC byte to write; an idle stream has nothing to interrupt.
    if (hasTransport) {
      return
    }
    const target = resolveTarget()
    if (target) {
      sendRuntimePtyInput(target.settings, target.ptyId, ESC)
    }
  }, [cancelPendingSends, hasTransport, isWorking, onStop, resolveTarget, transportInterrupt])

  return { send, interrupt }
}
