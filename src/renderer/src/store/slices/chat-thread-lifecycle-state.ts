// Runtime-only lifecycle of a chat thread's CLI process: whether a launch is in
// flight, how the last process ended, and when each live one was last used (the
// idle cap stops the least recently used). Composed into ChatModeSlice.

import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

/** Why a thread has no process. Idle-cap stops record nothing: the next send just relaunches. */
export type ChatThreadSessionEnd = {
  failed: boolean
  message: string | null
  /** Set when the launch was refused because the workspace folder is gone. */
  missingFolder?: string
}

export type ChatThreadLifecycleSlice = {
  chatThreadLaunching: Record<string, true>
  chatThreadSessionEnds: Record<string, ChatThreadSessionEnd>
  chatThreadSessionTouchedAt: Record<string, number>
  setChatThreadLaunching: (threadId: string, launching: boolean) => void
  setChatThreadSessionEnd: (threadId: string, end: ChatThreadSessionEnd | null) => void
  touchChatThreadSession: (threadId: string, at?: number) => void
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) {
    return record
  }
  const { [key]: _dropped, ...rest } = record
  return rest
}

export const createChatThreadLifecycleSlice: StateCreator<
  AppState,
  [],
  [],
  ChatThreadLifecycleSlice
> = (set) => ({
  chatThreadLaunching: {},
  chatThreadSessionEnds: {},
  chatThreadSessionTouchedAt: {},

  setChatThreadLaunching: (threadId, launching) =>
    set((s) => ({
      chatThreadLaunching: launching
        ? { ...s.chatThreadLaunching, [threadId]: true }
        : without(s.chatThreadLaunching, threadId)
    })),

  setChatThreadSessionEnd: (threadId, end) =>
    set((s) => ({
      chatThreadSessionEnds: end
        ? { ...s.chatThreadSessionEnds, [threadId]: end }
        : without(s.chatThreadSessionEnds, threadId)
    })),

  touchChatThreadSession: (threadId, at = Date.now()) =>
    set((s) => ({
      chatThreadSessionTouchedAt: { ...s.chatThreadSessionTouchedAt, [threadId]: at }
    }))
})
