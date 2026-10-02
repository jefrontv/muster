// Optimistic turns for the native chat view: queued composer sends, the hero's
// launch prompt and local slash-command markers, layered over the transcript so
// a send never vanishes between submit and transcript catch-up.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import type { NativeChatSession } from '../../../../shared/native-chat-types'
import {
  applyCommandMarkerBoundaries,
  appendPendingSendCache,
  appendCommandMarkerCache,
  launchPromptAsMessage,
  pendingSendsAsMessages,
  nextNativeChatPendingSendId,
  prunePendingSends,
  readCommandMarkerCache,
  readPendingSendCache,
  shouldPruneLaunchPrompt,
  writePendingSendCache,
  type NativeChatCommandMarker,
  type NativeChatPendingSend
} from './native-chat-pending'
import type { NativeChatLiveSession } from './use-native-chat-live-session'

export function useNativeChatOptimisticTurns({
  paneKey,
  agent,
  sessionId,
  terminalTabId,
  session,
  onSendStarted
}: {
  paneKey: string
  agent: NativeChatSession['agent']
  sessionId: string | null
  terminalTabId: string
  session: NativeChatLiveSession
  /** A send (or a pane/session switch) clears the view's stopped state. */
  onSendStarted: () => void
}) {
  const launchPrompt = useAppStore((s) => s.nativeChatLaunchPromptByTabId[terminalTabId] ?? null)
  const clearNativeChatLaunchPrompt = useAppStore((s) => s.clearNativeChatLaunchPrompt)
  const paneLaunchPrompt = launchPrompt?.agent === agent ? launchPrompt : null
  // Optimistic "queued" sends (mobile parity): a composer send is echoed
  // immediately and pruned once its real user turn lands in the transcript, so
  // the message never vanishes between send and transcript catch-up.
  const commandMarkerScope = useMemo(
    () => ({ paneKey, agent, sessionId }),
    [paneKey, agent, sessionId]
  )
  const pendingScope = useMemo(() => ({ paneKey, agent }), [paneKey, agent])
  const [pending, setPending] = useState<NativeChatPendingSend[]>(() =>
    readPendingSendCache(pendingScope)
  )
  // Slash commands aren't chat turns, so they get a small local "Ran /clear"
  // system line instead of a user bubble. Capped + cached per conversation.
  const [commandMarkers, setCommandMarkers] = useState<NativeChatCommandMarker[]>(() =>
    readCommandMarkerCache(commandMarkerScope)
  )
  // Reset the optimistic queue only when the pane/agent changes. A fresh launch
  // often learns its provider session id after the first send; clearing pending
  // on that transition briefly flashes the empty state before the transcript
  // user turn lands.
  useEffect(() => {
    setPending(readPendingSendCache(pendingScope))
    onSendStarted()
  }, [pendingScope, onSendStarted])
  // Command markers are session-scoped because slash commands like /clear are
  // local feedback for a specific transcript boundary.
  useEffect(() => {
    setCommandMarkers(readCommandMarkerCache(commandMarkerScope))
    onSendStarted()
  }, [commandMarkerScope, onSendStarted])
  // Prune echoes whose real user turn is now in the transcript.
  useEffect(() => {
    setPending((prev) =>
      writePendingSendCache(pendingScope, prunePendingSends(prev, session.messages))
    )
  }, [session.messages, pendingScope])
  useEffect(() => {
    if (!paneLaunchPrompt || !shouldPruneLaunchPrompt(paneLaunchPrompt, session.messages)) {
      return
    }
    clearNativeChatLaunchPrompt(terminalTabId)
  }, [clearNativeChatLaunchPrompt, paneLaunchPrompt, session.messages, terminalTabId])
  const onOptimisticSend = useCallback(
    (text: string, imagePaths?: string[]) => {
      onSendStarted()
      const sentAt = Date.now()
      const boundary = session.messages.at(-1)
      const entry: NativeChatPendingSend = {
        id: nextNativeChatPendingSendId(sentAt),
        text,
        sentAt,
        afterMessageId: boundary?.id ?? null,
        afterMessageTimestamp: boundary?.timestamp ?? null,
        ...(imagePaths ? { imagePaths } : {})
      }
      setPending(appendPendingSendCache(pendingScope, entry))
      return entry.id
    },
    [pendingScope, session.messages, onSendStarted]
  )
  const onOptimisticSendCanceled = useCallback(
    (pendingId: string) => {
      // Why: detach/interrupt cancels the delayed Enter, so its optimistic echo
      // must not come back from the pane cache as a prompt that was delivered.
      const next = readPendingSendCache(pendingScope).filter((entry) => entry.id !== pendingId)
      setPending(writePendingSendCache(pendingScope, next))
    },
    [pendingScope]
  )
  const onSlashCommand = useCallback(
    (command: string) => {
      setCommandMarkers(appendCommandMarkerCache(commandMarkerScope, command))
    },
    [commandMarkerScope]
  )

  const launchPromptMessage = useMemo(
    () => launchPromptAsMessage(paneLaunchPrompt, session.messages),
    [paneLaunchPrompt, session.messages]
  )
  const sessionWithLaunchPrompt = useMemo<typeof session>(() => {
    if (!launchPromptMessage) {
      return session
    }
    return { ...session, messages: [...session.messages, launchPromptMessage] }
  }, [launchPromptMessage, session])

  const sessionAfterCommandBoundaries = useMemo<typeof session>(() => {
    const messages = applyCommandMarkerBoundaries(sessionWithLaunchPrompt.messages, commandMarkers)
    return messages === sessionWithLaunchPrompt.messages
      ? sessionWithLaunchPrompt
      : { ...sessionWithLaunchPrompt, messages }
  }, [sessionWithLaunchPrompt, commandMarkers])
  const launchPromptVisible =
    launchPromptMessage !== null &&
    sessionAfterCommandBoundaries.messages.some((message) => message.id === launchPromptMessage.id)
  const failedLaunchPromptMessageIds = useMemo(() => {
    if (!paneLaunchPrompt?.failed || !launchPromptVisible || !launchPromptMessage) {
      return undefined
    }
    return new Set([launchPromptMessage.id])
  }, [paneLaunchPrompt?.failed, launchPromptMessage, launchPromptVisible])

  const pendingMessages = useMemo(
    () => pendingSendsAsMessages(pending, sessionAfterCommandBoundaries.messages),
    [pending, sessionAfterCommandBoundaries.messages]
  )
  return {
    pending,
    setPending,
    pendingScope,
    onOptimisticSend,
    onOptimisticSendCanceled,
    onSlashCommand,
    paneLaunchPrompt,
    sessionAfterCommandBoundaries,
    launchPromptVisible,
    failedLaunchPromptMessageIds,
    pendingMessages
  }
}
