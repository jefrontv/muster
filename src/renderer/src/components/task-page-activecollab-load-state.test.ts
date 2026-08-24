import { describe, expect, it } from 'vitest'

import {
  deriveActiveCollabTaskListState,
  describeActiveCollabTaskListError
} from './task-page-activecollab-load-state'
import type { ActiveCollabFailure } from '../../../shared/activecollab-api-types'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'

function failure(kind: ActiveCollabFailure['kind'], error = 'boom'): ActiveCollabFailure {
  return { ok: false, kind, error, status: null }
}

function task(id: number): ActiveCollabTask {
  return {
    id,
    projectId: 7,
    projectName: 'Muster',
    taskNumber: id,
    name: `Task ${id}`,
    bodyHtml: '',
    isCompleted: false,
    startOn: null,
    dueOn: null,
    createdOn: null,
    updatedOn: null,
    assigneeId: null,
    assigneeName: null,
    createdById: null,
    createdByName: null,
    labels: [],
    commentCount: 0,
    urlPath: `/projects/7/tasks/${id}`,
    taskListId: null,
    isHiddenFromClients: false,
    isImportant: false,
    estimate: null,
    jobTypeId: null,
    openSubtaskCount: null,
    totalSubtaskCount: null
  }
}

const IDLE = { tasks: [], hasMore: false, loading: false, failure: null }

describe('ActiveCollab task list error description', () => {
  it('offers the connect path for the two credential failures', () => {
    expect(describeActiveCollabTaskListError(failure('auth')).canConnect).toBe(true)
    expect(describeActiveCollabTaskListError(failure('not-configured')).canConnect).toBe(true)
  })

  it('withholds the connect path from faults reconnecting cannot fix', () => {
    for (const kind of ['api', 'invalid-request', 'unknown'] as const) {
      expect(describeActiveCollabTaskListError(failure(kind)).canConnect).toBe(false)
    }
  })

  it('takes its copy from the shared failure module, interpolating the provider error', () => {
    expect(describeActiveCollabTaskListError(failure('api', 'task list unavailable'))).toEqual({
      message:
        'ActiveCollab returned an error that reconnecting will not fix: task list unavailable',
      canConnect: false
    })
  })
})

describe('ActiveCollab task list load state', () => {
  it('reports the initial read as loading', () => {
    expect(deriveActiveCollabTaskListState({ ...IDLE, loading: true })).toEqual({ kind: 'loading' })
  })

  it('separates a settled empty result from a read still in flight', () => {
    expect(deriveActiveCollabTaskListState(IDLE)).toEqual({ kind: 'empty' })
  })

  it('reports rows with their paging flag', () => {
    expect(deriveActiveCollabTaskListState({ ...IDLE, tasks: [task(1)], hasMore: true })).toEqual({
      kind: 'ready',
      tasks: [task(1)],
      hasMore: true,
      loadingMore: false,
      error: null
    })
  })

  it('fails with described copy when nothing loaded', () => {
    const state = deriveActiveCollabTaskListState({ ...IDLE, failure: failure('auth') })
    expect(state).toEqual({
      kind: 'failed',
      error: {
        message: describeActiveCollabTaskListError(failure('auth')).message,
        canConnect: true
      }
    })
  })

  it('keeps loaded rows on screen when the next page fails', () => {
    const state = deriveActiveCollabTaskListState({
      tasks: [task(1)],
      hasMore: true,
      loading: false,
      failure: failure('api')
    })
    expect(state.kind).toBe('ready')
    expect(state.kind === 'ready' && state.error?.canConnect).toBe(false)
    expect(state.kind === 'ready' && state.tasks).toHaveLength(1)
  })

  it('marks a next-page read as loadingMore rather than replacing the rows', () => {
    const state = deriveActiveCollabTaskListState({
      tasks: [task(1)],
      hasMore: true,
      loading: true,
      failure: null
    })
    expect(state).toMatchObject({ kind: 'ready', loadingMore: true })
  })

  it('shows progress instead of the error a retry is already retrying', () => {
    expect(
      deriveActiveCollabTaskListState({ ...IDLE, loading: true, failure: failure('api') })
    ).toEqual({ kind: 'loading' })
  })
})
