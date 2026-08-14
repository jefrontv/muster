import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import {
  createActiveCollabTaskPageViewSlice,
  type ActiveCollabTaskPageViewActions,
  type ActiveCollabTaskPageViewState
} from './activecollab-task-page-view'

type Slice = ActiveCollabTaskPageViewState & ActiveCollabTaskPageViewActions

function createStore() {
  return create<Slice>()(
    (set, get, api) =>
      createActiveCollabTaskPageViewSlice(
        set as never,
        get as never,
        api as never
      ) as unknown as Slice
  )
}

const REF = { projectId: 5898, taskId: 504741 }
const PROJECT = { id: 5898, name: 'Dev Portal' }

describe('activecollab task page view', () => {
  it('keeps the project drill-in when the selection changes within one scope', () => {
    const store = createStore()
    store.getState().setActiveCollabTaskPageProject('local', PROJECT)
    store.getState().setActiveCollabTaskPageSelection('local', REF)

    expect(store.getState().activeCollabTaskPageView).toEqual({
      scope: 'local',
      selected: REF,
      openProject: PROJECT
    })
  })

  it('keeps the selection when the drill-in closes within one scope', () => {
    const store = createStore()
    store.getState().setActiveCollabTaskPageSelection('local', REF)
    store.getState().setActiveCollabTaskPageProject('local', PROJECT)
    store.getState().setActiveCollabTaskPageProject('local', null)

    expect(store.getState().activeCollabTaskPageView).toEqual({
      scope: 'local',
      selected: REF,
      openProject: null
    })
  })

  it('a write under a new scope drops the other scope entirely', () => {
    // A selection made against one runtime context must never reopen against another host's ids.
    const store = createStore()
    store.getState().setActiveCollabTaskPageSelection('local', REF)
    store.getState().setActiveCollabTaskPageProject('runtime:other#0', PROJECT)

    expect(store.getState().activeCollabTaskPageView).toEqual({
      scope: 'runtime:other#0',
      selected: null,
      openProject: PROJECT
    })
  })
})

// Type-level guard that the slice stays composed into AppState.
type _Assert = AppState extends Slice ? true : never
const _assert: _Assert = true
void _assert
