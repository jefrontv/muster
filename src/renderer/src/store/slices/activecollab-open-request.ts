// A pending "open this ActiveCollab task" request, raised by a notification click.
//
// The Tasks panel keeps its own selection in local component state, which the click cannot reach:
// when the notification arrives the user is usually on another view entirely, so the panel is not
// even mounted yet. This slice is the buffer between the two — main's click sets a request, and
// the panel drains it whenever it next renders.
//
// Deliberately one slot rather than a queue: two notifications clicked in a row mean the user
// wants the second task, not a backlog to step through.

import type { StateCreator } from 'zustand'
import type { ActiveCollabTaskRef } from '../../../../shared/activecollab-api-types'
import type { AppState } from '../types'

export type ActiveCollabOpenRequestState = {
  activeCollabTaskOpenRequest: ActiveCollabTaskRef | null
}

export type ActiveCollabOpenRequestActions = {
  /** Asks the Tasks panel to open this task the next time it renders. */
  requestActiveCollabTask: (ref: ActiveCollabTaskRef) => void
  /**
   * Drops the request once honoured.
   *
   * Clearing matters: without it, re-entering Tasks later would silently yank the user back to a
   * task they already dealt with, long after the notification that asked for it.
   */
  clearActiveCollabTaskOpenRequest: () => void
}

export const createActiveCollabOpenRequestSlice: StateCreator<
  AppState,
  [],
  [],
  ActiveCollabOpenRequestState & ActiveCollabOpenRequestActions
> = (set) => ({
  activeCollabTaskOpenRequest: null,
  requestActiveCollabTask: (ref) => set({ activeCollabTaskOpenRequest: ref }),
  clearActiveCollabTaskOpenRequest: () => set({ activeCollabTaskOpenRequest: null })
})
