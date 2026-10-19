// Per-row selectors over the chat engine store. Each hook returns a reference
// that only changes when its own slice does, so React skips the other rows.

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ChatEngineThreadMeta, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { chatEngineThreadStore, type ChatEngineThreadView } from './chat-engine-thread-store'

/** Mount once per visible thread; rows below read through the selectors. */
export function useRetainChatEngineThread(threadId: string): void {
  useEffect(() => chatEngineThreadStore().retain(threadId), [threadId])
}

function useThreadSlice<T>(threadId: string, select: (view: ChatEngineThreadView | null) => T): T {
  const subscribe = useCallback(
    (listener: () => void) => chatEngineThreadStore().subscribe(threadId, listener),
    [threadId]
  )
  return useSyncExternalStore(subscribe, () => select(chatEngineThreadStore().read(threadId)))
}

const EMPTY_ORDER: string[] = []

export function useChatEngineTurnOrder(threadId: string): string[] {
  return useThreadSlice(threadId, (view) => view?.order ?? EMPTY_ORDER)
}

export function useChatEngineTurn(threadId: string, turnId: string): ChatEngineTurn | null {
  return useThreadSlice(threadId, (view) => view?.turns.get(turnId) ?? null)
}

export function useChatEngineMeta(threadId: string): ChatEngineThreadMeta | null {
  return useThreadSlice(threadId, (view) => view?.meta ?? null)
}

/** False until the first snapshot lands. */
export function useChatEngineThreadLoaded(threadId: string): boolean {
  return useThreadSlice(threadId, (view) => view !== null)
}
