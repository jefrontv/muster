// Feeds Code mode's conversation into the chat engine store under a per-leaf
// thread id, so ChatThreadSurface draws it. The entry goes when the view does.

import { useLayoutEffect, useMemo, useRef } from 'react'
import { translate } from '@/i18n/i18n'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { chatEngineThreadStore } from '../chat-thread/chat-engine-thread-store'
import {
  nativeChatEngineMeta,
  nativeChatEngineTurns,
  type NativeChatEngineTurnsState
} from './native-chat-engine-turns'

export function nativeChatEngineThreadId(paneKey: string): string {
  return `code:${paneKey}`
}

export function useNativeChatEngineThread(input: {
  threadId: string
  agent: string
  sessionId: string | null
  cwd: string | null
  messages: readonly NativeChatMessage[]
  isWorking: boolean
  awaitingUser: boolean
  failedDeliveryMessageIds?: ReadonlySet<string>
}): void {
  const { threadId, agent, sessionId, cwd, messages, isWorking, awaitingUser } = input
  const failedIds = input.failedDeliveryMessageIds
  const previousRef = useRef<{ threadId: string; state: NativeChatEngineTurnsState } | null>(null)
  const failedDeliveryText = translate(
    'components.native-chat.launchPromptNotDelivered',
    'Not delivered — check the terminal'
  )
  const state = useMemo(() => {
    const previous = previousRef.current?.threadId === threadId ? previousRef.current.state : null
    return nativeChatEngineTurns(
      {
        agent,
        messages,
        isWorking,
        awaitingUser,
        ...(failedIds ? { failedDeliveryMessageIds: failedIds } : {}),
        failedDeliveryText,
        now: Date.now()
      },
      previous
    )
  }, [threadId, agent, messages, isWorking, awaitingUser, failedIds, failedDeliveryText])
  const meta = useMemo(
    () => nativeChatEngineMeta({ threadId, sessionId, cwd, isWorking, awaitingUser }),
    [threadId, sessionId, cwd, isWorking, awaitingUser]
  )
  // Written during render, ahead of the surface below, so it never draws a stale frame.
  const writtenRef = useRef<{ state: NativeChatEngineTurnsState; meta: typeof meta } | null>(null)
  if (writtenRef.current?.state !== state || writtenRef.current.meta !== meta) {
    writtenRef.current = { state, meta }
    previousRef.current = { threadId, state }
    chatEngineThreadStore().replaceLocal(threadId, meta, state.turns)
  }
  const latestRef = useRef({ meta, turns: state.turns })
  latestRef.current = { meta, turns: state.turns }
  useLayoutEffect(() => {
    // Re-seeds after a dev double-mount dropped the entry.
    chatEngineThreadStore().replaceLocal(threadId, latestRef.current.meta, latestRef.current.turns)
    return () => chatEngineThreadStore().dropLocal(threadId)
  }, [threadId])
}
