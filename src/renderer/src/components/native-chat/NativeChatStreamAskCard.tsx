// Stream-json AskUserQuestion has no TTY. The CLI emits the prompt then
// immediately cancels (tool result: "user did not answer"). Latch the prompt
// until the user answers or dismisses — do not unmount with the live request.
// After submit the hook still carries the same AskUserQuestion; fingerprint
// the dismissed prompt so that leftover status cannot resurrect the card.

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { isAskUserQuestionTool } from '../../../../shared/agent-question-answered-intent'
import {
  formatAskAnswer,
  parseAskFromStatus,
  type AskPrompt
} from '../../../../shared/native-chat-ask'
import { inferQuestionAnsweredFromCurrentStatus } from '../terminal-pane/agent-question-answered-inference'
import { useAppStore } from '../../store'
import { nativeChatCardDismissKey } from './native-chat-dismiss-key'
import type { AskAnswerSelection } from './native-chat-interactive-prompt'
import { NativeChatQuestionCard } from './NativeChatQuestionCard'
import type {
  NativeChatPermissionBehavior,
  NativeChatPermissionRequest
} from './native-chat-view-types'

type LatchedAsk = {
  prompt: AskPrompt
  requestId: string | null
}

export function streamAskPermissionRequest(
  request: NativeChatPermissionRequest | null | undefined
): NativeChatPermissionRequest | null {
  return request && isAskUserQuestionTool(request.toolName) ? request : null
}

function promptFromRequest(request: NativeChatPermissionRequest): AskPrompt | null {
  return parseAskFromStatus(JSON.stringify(request.input), request.toolName)
}

function askDismissKey(prompt: AskPrompt): string | null {
  return nativeChatCardDismissKey({ kind: 'question', prompt })
}

function incomingAsk(
  liveRequest: NativeChatPermissionRequest | null,
  hookPrompt: string | null,
  hookToolName: string | null
): LatchedAsk | null {
  if (liveRequest) {
    const prompt = promptFromRequest(liveRequest)
    if (prompt) {
      return { prompt, requestId: liveRequest.requestId }
    }
  }
  if (isAskUserQuestionTool(hookToolName ?? undefined)) {
    const prompt = parseAskFromStatus(hookPrompt, hookToolName ?? undefined)
    if (prompt) {
      return { prompt, requestId: null }
    }
  }
  return null
}

function clearLingeringAskWait(paneKey: string): void {
  const entry = useAppStore.getState().agentStatusByPaneKey[paneKey]
  inferQuestionAnsweredFromCurrentStatus({
    paneKey,
    getStatusEntry: () => entry,
    inferQuestionAnswered: (request) =>
      window.api.agentStatus.inferQuestionAnswered(request).catch((err) => {
        console.warn('[agent-question] stream-ask inference failed:', err)
        return false
      })
  })
}

export function NativeChatStreamAskCard({
  paneKey,
  liveRequest,
  onRespond,
  onActiveChange,
  answerInputRef
}: {
  paneKey: string
  liveRequest: NativeChatPermissionRequest | null
  onRespond: (requestId: string, behavior: NativeChatPermissionBehavior, message?: string) => void
  onActiveChange?: (active: boolean) => void
  answerInputRef?: RefObject<HTMLInputElement | null>
}): React.JSX.Element | null {
  const hookPrompt = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.interactivePrompt ?? null)
  const hookToolName = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.toolName ?? null)
  const [latched, setLatched] = useState<LatchedAsk | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const incoming = incomingAsk(liveRequest, hookPrompt, hookToolName)
    if (!incoming) {
      setDismissedKey(null)
      return
    }
    if (askDismissKey(incoming.prompt) === dismissedKey) {
      return
    }
    if (incoming.requestId) {
      setLatched(incoming)
      return
    }
    setLatched((current) => current ?? incoming)
  }, [dismissedKey, hookPrompt, hookToolName, liveRequest])

  useEffect(() => {
    onActiveChange?.(latched !== null)
    return () => onActiveChange?.(false)
  }, [latched, onActiveChange])

  const dismiss = useCallback(
    (sendText: string | null) => {
      const requestId = latched?.requestId
      if (latched) {
        setDismissedKey(askDismissKey(latched.prompt))
      }
      setLatched(null)
      setSubmitting(false)
      clearLingeringAskWait(paneKey)
      if (requestId) {
        onRespond(
          requestId,
          'deny',
          sendText
            ? `The user answered in the Muster chat UI:\n${sendText}`
            : 'The user dismissed the question.'
        )
      }
    },
    [latched, onRespond, paneKey]
  )

  const onAnswer = useCallback(
    (selections: AskAnswerSelection[]) => {
      if (!latched || submitting) {
        return
      }
      setSubmitting(true)
      dismiss(formatAskAnswer(latched.prompt, selections))
    },
    [dismiss, latched, submitting]
  )

  if (!latched) {
    return null
  }
  return (
    <NativeChatQuestionCard
      prompt={latched.prompt}
      isSubmitting={submitting}
      onAnswer={onAnswer}
      onCancel={() => dismiss(null)}
      answerInputRef={answerInputRef}
    />
  )
}
