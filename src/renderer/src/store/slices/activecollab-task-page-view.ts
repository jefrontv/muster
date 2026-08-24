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
import {
  EMPTY_ACTIVECOLLAB_MY_WORK_FILTER,
  type ActiveCollabMyWorkFilter
} from '../../components/task-page-activecollab-my-work-filter'
import type { AppState } from '../types'

export type ActiveCollabTaskPageView = {
  /** The runtime-context cache prefix the view belongs to (see getActiveCollabReadScope). */
  scope: string
  selected: ActiveCollabTaskRef | null
  openProject: { id: number; name: string } | null
  filter: ActiveCollabMyWorkFilter
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
  /** Sets the My Work filter, keeping the rest of the view when the scope matches. */
  setActiveCollabTaskPageFilter: (scope: string, filter: ActiveCollabMyWorkFilter) => void
}

/**
 * Every member preserved across a matching scope, defaulted on a fresh or foreign one. One write
 * changes exactly one member; the rest are carried or reset through this.
 */
function viewBase(
  scope: string,
  current: ActiveCollabTaskPageView | null
): ActiveCollabTaskPageView {
  const matches = current?.scope === scope
  return {
    scope,
    selected: matches ? current.selected : null,
    openProject: matches ? current.openProject : null,
    filter: matches ? current.filter : EMPTY_ACTIVECOLLAB_MY_WORK_FILTER
  }
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
        ...viewBase(scope, state.activeCollabTaskPageView),
        selected
      }
    })),
  setActiveCollabTaskPageProject: (scope, openProject) =>
    set((state) => ({
      activeCollabTaskPageView: {
        ...viewBase(scope, state.activeCollabTaskPageView),
        openProject
      }
    })),
  setActiveCollabTaskPageFilter: (scope, filter) =>
    set((state) => ({
      activeCollabTaskPageView: {
        ...viewBase(scope, state.activeCollabTaskPageView),
        filter
      }
    }))
})
