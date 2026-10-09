// Composer send path for stream-transport panes (chat-mode threads): the text
// goes to the headless child's stdin as one user turn — no PTY keystrokes, no
// delayed Enter, no bracketed paste.

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import { pushHistory, type HistoryState } from './native-chat-composer-state'
import type { NativeChatTransport } from './native-chat-view-types'
import type { ChatThreadSendMode } from '../../../../shared/chat-thread-stream-types'

export function useNativeChatTransportSend(args: {
  agent: AgentType
  transportSend: NativeChatTransport['send'] | undefined
  /** A turn is running: the send lands in the queue strip, not as a thread bubble. */
  isWorking: boolean
  onOptimisticSend?: (text: string, imagePaths?: string[]) => string | undefined
  onOptimisticSendCanceled?: (pendingId: string) => void
  setHistory: Dispatch<SetStateAction<HistoryState>>
  setDraft: (value: string) => void
  setCaret: Dispatch<SetStateAction<number>>
  clearSkillOrigin: () => void
  setNotice: Dispatch<SetStateAction<string | null>>
}): (text: string, imagePaths?: string[], mode?: ChatThreadSendMode) => void {
  const {
    agent,
    transportSend,
    isWorking,
    onOptimisticSend,
    onOptimisticSendCanceled,
    setHistory,
    setDraft,
    setCaret,
    clearSkillOrigin,
    setNotice
  } = args
  return useCallback(
    (text: string, imagePaths?: string[], mode: ChatThreadSendMode = 'auto') => {
      if (!transportSend) {
        return
      }
      // Mid-turn sends show in the queue strip; only a new turn gets a thread bubble.
      const pendingId = isWorking ? undefined : onOptimisticSend?.(text, imagePaths)
      void transportSend(text, imagePaths, mode).then((outcome) => {
        if (outcome !== 'sent' && pendingId) {
          // Why: main queued it (the turn was still running) or the stream died;
          // either way a thread bubble would claim a turn that hasn't started.
          onOptimisticSendCanceled?.(pendingId)
        } else if (outcome === 'sent' && !pendingId) {
          onOptimisticSend?.(text, imagePaths)
        }
      })
      emitNativeChatMessageSent({ agent, runtime: 'local' })
      setHistory((prev) => pushHistory(prev, text))
      setDraft('')
      setCaret(0)
      clearSkillOrigin()
      setNotice(null)
    },
    [
      agent,
      clearSkillOrigin,
      isWorking,
      onOptimisticSend,
      onOptimisticSendCanceled,
      setCaret,
      setDraft,
      setHistory,
      setNotice,
      transportSend
    ]
  )
}
