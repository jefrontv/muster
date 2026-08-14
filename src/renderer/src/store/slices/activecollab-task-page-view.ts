// Where the user was on the ActiveCollab Tasks surface: the open task and the project drill-in.
//
// The panel used to keep both in component state, so ANY trip away from Tasks — a chat, a
// workspace, Settings — unmounted the panel and dumped the user back at the bare list on return.
// Held here, the surface reopens exactly where it was left for the life of the window.
//
// Scoped by the same cache-prefix the reads use: a selection made against one runtime context
// must not reopen against another host's task ids. Deliberately not persisted to disk — a fresh
// start after a relaunch is expected; losing your place over a sidebar detour is not.

import type { StateCreator } from 'zustand'
import type { ActiveCollabTaskRef } from '../../../../shared/activecollab-api-types'
import type { AppState } from '../types'

export type ActiveCollabTaskPageView = {
  /** The runtime-context cache prefix the view belongs to (see getActiveCollabReadScope). */
  scope: string
  selected: ActiveCollabTaskRef | null
  openProject: { id: number; name: string } | null
}

export type ActiveCollabTaskPageViewState = {
  activeCollabTaskPageView: ActiveCollabTaskPageView | null
}

export type ActiveCollabTaskPageViewActions = {
  /** Sets the open task, keeping the project drill-in when the scope matches. */
  setActiveCollabTaskPageSelection: (scope: string, selected: ActiveCollabTaskRef | null) => void
  /** Sets the project drill-in, keeping the open task when the scope matches. */
  setActiveCollabTaskPageProject: (
    scope: string,
    openProject: { id: number; name: string } | null
  ) => void
}

export const createActiveCollabTaskPageViewSlice: StateCreator<
  AppState,
  [],
  [],
  ActiveCollabTaskPageViewState & ActiveCollabTaskPageViewActions
> = (set) => ({
  activeCollabTaskPageView: null,
  setActiveCollabTaskPageSelection: (scope, selected) =>
    set((state) => ({
      activeCollabTaskPageView: {
        scope,
        selected,
        openProject:
          state.activeCollabTaskPageView?.scope === scope
            ? state.activeCollabTaskPageView.openProject
            : null
      }
    })),
  setActiveCollabTaskPageProject: (scope, openProject) =>
    set((state) => ({
      activeCollabTaskPageView: {
        scope,
        openProject,
        selected:
          state.activeCollabTaskPageView?.scope === scope
            ? state.activeCollabTaskPageView.selected
            : null
      }
    }))
})
