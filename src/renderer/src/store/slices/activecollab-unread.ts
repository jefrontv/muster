// The unread counts behind the sidebar Tasks badge.
//
// Kept out of the row caches deliberately: those are scoped, TTL'd projections of a fetch, while
// this is a single small figure main owns and pushes. It has no TTL and no scope key because main
// already keys the counts on the connected credential — a second key here could only disagree.
//
// Main is the source of truth. The renderer reads once on mount and then listens; it never derives
// a count from rows it happens to be holding, because the badge must include tasks the user has
// never fetched.

import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { ActiveCollabUnread } from '../../../../shared/activecollab-api-types'

const NO_UNREAD: ActiveCollabUnread = { total: 0, byTask: {} }

export type ActiveCollabUnreadState = {
  activeCollabUnread: ActiveCollabUnread
}

export type ActiveCollabUnreadActions = {
  /** Reads the current counts and subscribes to main's pushes. Answers its unsubscribe. */
  watchActiveCollabUnread: () => () => void
  /**
   * Clears one task, which is what opening it in the detail pane means.
   *
   * Fired for every task opened, and almost none of them have anything unread, so the main handler
   * short-circuits a no-op write. Failure is swallowed on purpose: a badge that will not clear is a
   * nuisance, not something worth interrupting a reader with an error surface for.
   */
  markActiveCollabTaskRead: (taskId: number) => Promise<void>
}

export const createActiveCollabUnreadSlice: StateCreator<
  AppState,
  [],
  [],
  ActiveCollabUnreadState & ActiveCollabUnreadActions
> = (set) => ({
  activeCollabUnread: NO_UNREAD,

  watchActiveCollabUnread: () => {
    let disposed = false
    const api = window.api.activecollab

    void (async () => {
      const result = await api.unread()
      // A late answer after unsubscribe would resurrect a count for a screen nobody is watching.
      if (!disposed && result.ok) {
        set({ activeCollabUnread: result.value })
      }
    })()

    const stop = api.onUnreadChanged((unread) => {
      if (!disposed) {
        set({ activeCollabUnread: unread })
      }
    })

    return () => {
      disposed = true
      stop()
    }
  },

  markActiveCollabTaskRead: async (taskId) => {
    const result = await window.api.activecollab.markTaskRead({ taskId })
    if (result.ok) {
      set({ activeCollabUnread: result.value })
    }
  }
})
