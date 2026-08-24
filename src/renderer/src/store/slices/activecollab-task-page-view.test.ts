import { describe, expect, it } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import {
  EMPTY_ACTIVECOLLAB_MY_WORK_FILTER,
  type ActiveCollabMyWorkFilter
} from '../../components/task-page-activecollab-my-work-filter'
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
const FILTER: ActiveCollabMyWorkFilter = {
  text: 'ship',
  labelNames: ['docs'],
  projectIds: [10]
}

describe('activecollab task page view', () => {
  it('keeps the project drill-in when the selection changes within one scope', () => {
    const store = createStore()
    store.getState().setActiveCollabTaskPageProject('local', PROJECT)
    store.getState().setActiveCollabTaskPageSelection('local', REF)

    expect(store.getState().activeCollabTaskPageView).toEqual({
      scope: 'local',
      selected: REF,
      openProject: PROJECT,
      filter: EMPTY_ACTIVECOLLAB_MY_WORK_FILTER
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
      openProject: null,
      filter: EMPTY_ACTIVECOLLAB_MY_WORK_FILTER
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
      openProject: PROJECT,
      filter: EMPTY_ACTIVECOLLAB_MY_WORK_FILTER
    })
  })

  it('defaults the filter to empty on the first write in a scope', () => {
    const store = createStore()
    store.getState().setActiveCollabTaskPageSelection('local', REF)

    expect(store.getState().activeCollabTaskPageView?.filter).toEqual(
      EMPTY_ACTIVECOLLAB_MY_WORK_FILTER
    )
  })

  it('keeps the filter while another member changes within one scope', () => {
    const store = createStore()
    store.getState().setActiveCollabTaskPageFilter('local', FILTER)
    store.getState().setActiveCollabTaskPageSelection('local', REF)

    expect(store.getState().activeCollabTaskPageView).toEqual({
      scope: 'local',
      selected: REF,
      openProject: null,
      filter: FILTER
    })
  })

  it('a filter write under a new scope resets the other members', () => {
    const store = createStore()
    store.getState().setActiveCollabTaskPageSelection('local', REF)
    store.getState().setActiveCollabTaskPageProject('local', PROJECT)
    store.getState().setActiveCollabTaskPageFilter('runtime:other#0', FILTER)

    expect(store.getState().activeCollabTaskPageView).toEqual({
      scope: 'runtime:other#0',
      selected: null,
      openProject: null,
      filter: FILTER
    })
  })

  it('preserves the filter object by reference within one scope', () => {
    const store = createStore()
    store.getState().setActiveCollabTaskPageFilter('local', FILTER)
    store.getState().setActiveCollabTaskPageSelection('local', REF)

    expect(store.getState().activeCollabTaskPageView?.filter).toBe(FILTER)
  })
})

// Type-level guard that the slice stays composed into AppState.
type _Assert = AppState extends Slice ? true : never
const _assert: _Assert = true
void _assert
