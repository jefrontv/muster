// Writes for subtasks: create/update/complete/reopen/promote. Subtasks arrive INLINE on the
// task-detail response, so these routes are the only subtask mutations v1 exposes. Completion and
// reopening are PROJECT-SCOPELESS (`complete/subtask/:id`), the same family as a task's routes.
//
// Echoes answer `… | null` exactly like the task writes in mutations.ts: null means the write
// LANDED and the server said nothing usable — a refetch, not a failure.

import type {
  ActiveCollabSubtask,
  ActiveCollabSubtaskUpdate
} from '../../shared/activecollab-types'
import { acDateForWrite } from '../../shared/activecollab-dates'
import { acIsRecord } from './codecs'
import type { AcHttpClient } from './http'
import { normaliseSubtask } from './tasks'

type Row = Record<string, unknown>

/** Single-object responses are wrapped as `{ single: {...}, <sidecars> }` on most endpoints. */
function unwrapSingle(payload: unknown): unknown {
  return acIsRecord(payload) ? (payload.single ?? payload) : payload
}

/**
 * Only keys the caller actually supplied are serialised, matching task updates: absent leaves a
 * field alone, an explicit null clears it. `name` is written under BOTH spellings — older builds
 * read `body` — so a v4 and a v5 instance both show the text the user typed.
 */
function subtaskPayload(update: ActiveCollabSubtaskUpdate): Row {
  const payload: Row = {}
  if (update.name !== undefined) {
    payload.name = update.name
    payload.body = update.name
  }
  if (update.assigneeId !== undefined) {
    payload.assignee_id = update.assigneeId
  }
  if (update.dueOn !== undefined) {
    // null goes out as null — that is what clears the date, same as a task's due_on.
    payload.due_on = update.dueOn === null ? null : acDateForWrite(update.dueOn)
  }
  return payload
}

export async function createSubtask(args: {
  http: AcHttpClient
  projectId: number
  taskId: number
  name: string
  assigneeId?: number | null
  dueOn?: number | null
}): Promise<ActiveCollabSubtask | null> {
  const response = await args.http.request<unknown>(
    `projects/${args.projectId}/tasks/${args.taskId}/subtasks`,
    {
      method: 'POST',
      body: subtaskPayload({
        name: args.name,
        assigneeId: args.assigneeId,
        dueOn: args.dueOn
      })
    }
  )
  return normaliseSubtask(unwrapSingle(response.data))
}

export async function updateSubtask(args: {
  http: AcHttpClient
  projectId: number
  taskId: number
  subtaskId: number
  update: ActiveCollabSubtaskUpdate
}): Promise<ActiveCollabSubtask | null> {
  const response = await args.http.request<unknown>(
    `projects/${args.projectId}/tasks/${args.taskId}/subtasks/${args.subtaskId}`,
    { method: 'PUT', body: subtaskPayload(args.update) }
  )
  return normaliseSubtask(unwrapSingle(response.data))
}

/** Project-scopeless — see the file header. No body: the route itself is the instruction. */
export async function completeSubtask(args: {
  http: AcHttpClient
  subtaskId: number
}): Promise<ActiveCollabSubtask | null> {
  const response = await args.http.request<unknown>(`complete/subtask/${args.subtaskId}`, {
    method: 'PUT'
  })
  return normaliseSubtask(unwrapSingle(response.data))
}

/** The inverse of {@link completeSubtask}. `open`, not `reopen`: the route ActiveCollab maps. */
export async function reopenSubtask(args: {
  http: AcHttpClient
  subtaskId: number
}): Promise<ActiveCollabSubtask | null> {
  const response = await args.http.request<unknown>(`open/subtask/${args.subtaskId}`, {
    method: 'PUT'
  })
  return normaliseSubtask(unwrapSingle(response.data))
}
