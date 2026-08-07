// Composer send path for stream-transport panes (chat-mode threads): the text
// goes to the headless child's stdin as one user turn — no PTY keystrokes, no
// delayed Enter, no bracketed paste.

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import { pushHistory, type HistoryState } from './native-chat-composer-state'

export function useNativeChatTransportSend(args: {
  agent: AgentType
  transportSend: ((text: string) => Promise<boolean>) | undefined
  onOptimisticSend?: (text: string, imagePaths?: string[]) => string | undefined
  onOptimisticSendCanceled?: (pendingId: string) => void
  setHistory: Dispatch<SetStateAction<HistoryState>>
  setDraft: (value: string) => void
  setCaret: Dispatch<SetStateAction<number>>
  clearSkillOrigin: () => void
  setNotice: Dispatch<SetStateAction<string | null>>
}): (text: string) => void {
  const {
    agent,
    transportSend,
    onOptimisticSend,
    onOptimisticSendCanceled,
    setHistory,
    setDraft,
    setCaret,
    clearSkillOrigin,
    setNotice
  } = args
  return useCallback(
    (text: string) => {
      if (!transportSend) {
        return
      }
      const pendingId = onOptimisticSend?.(text)
      void transportSend(text).then((delivered) => {
        if (!delivered && pendingId) {
          // Why: the stream died between render and send; a stuck queued
          // bubble would claim delivery that never happened.
          onOptimisticSendCanceled?.(pendingId)
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
