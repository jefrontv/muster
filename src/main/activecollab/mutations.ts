// Writes for the ActiveCollab task provider: field edits, open/close, comments, and the label
// vocabulary a label edit has to pick from.
//
// Three server behaviours shape this file:
//   - Completing, reopening and commenting are PROJECT-SCOPELESS. ActiveCollab routes them at
//     `complete/task/{id}`, `open/task/{id}` and `comments/task/{id}` with no project segment, so
//     no projectId is asked for. Both reference clients accept one and silently discard it.
//   - Dates are epoch ints on read but "YYYY-MM-DD" strings on write, and an omitted key means
//     "leave alone" while an explicit null CLEARS the field. Both distinctions survive here.
//   - A label write REPLACES the whole set and takes bare name strings, never objects.
//
// Every write answers `… | null`. The API echoes the updated row on the builds we have seen, but
// null is reachable, and it means the write LANDED and the server said nothing usable — a refetch,
// not a failure. Reporting it as an error would tell the user their own successful edit failed.

import type {
  ActiveCollabComment,
  ActiveCollabLabel,
  ActiveCollabTask,
  ActiveCollabTaskUpdate
} from '../../shared/activecollab-types'
import { acDateForWrite, acEpochToLocalDay } from '../../shared/activecollab-dates'
import { acAttachments, acIsRecord, acLabels, acNullableId } from './codecs'
import type { AcHttpClient } from './http'

type Row = Record<string, unknown>

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Epoch seconds to epoch ms. `0` and null both mean unset, which is not 1970. */
function epochMs(value: unknown): number | null {
  const seconds = asNumber(value)
  return seconds !== null && seconds > 0 ? seconds * 1000 : null
}

/** Single-object responses are wrapped as `{ single: {...}, <sidecars> }` on most endpoints. */
function unwrapSingle(payload: unknown): unknown {
  return acIsRecord(payload) ? (payload.single ?? payload) : payload
}

/**
 * The name the echoed ROW carried, or null. A write echoes the same nameless shape a read does,
 * so the caller in `ipc/activecollab.ts` runs the cached id-to-name join over the result — the
 * echoed row is patched straight into the renderer's caches and must not blank a resolved name.
 */
function assigneeNameOf(row: Row): string | null {
  const direct = asText(row.assignee_name)
  if (direct.length > 0) {
    return direct
  }
  const names = row.assignee_names
  const first = Array.isArray(names) ? asText(names[0]) : ''
  return first.length > 0 ? first : null
}

/**
 * A write echoes the same row shape the read endpoints return, so this mirrors the reader in
 * `tasks.ts` field for field — that one is module-private to the read slice. `ActiveCollabTask` is
 * a closed object type, so a change to the shared contract breaks both copies at compile time
 * instead of letting the two drift apart silently.
 */
function normaliseTask(value: unknown): ActiveCollabTask | null {
  if (!acIsRecord(value)) {
    return null
  }
  const id = asNumber(value.id)
  if (id === null) {
    return null
  }
  const projectId = asNumber(value.project_id) ?? 0
  return {
    id,
    projectId,
    projectName: asText(value.project_name),
    taskNumber: asNumber(value.task_number) ?? 0,
    name: asText(value.name),
    bodyHtml: asText(value.body),
    // `is_completed` and `completed_on` disagree on some rows; either one closes the task.
    isCompleted: value.is_completed === true || epochMs(value.completed_on) !== null,
    startOn: acEpochToLocalDay(asNumber(value.start_on)),
    dueOn: acEpochToLocalDay(asNumber(value.due_on)),
    createdOn: epochMs(value.created_on),
    updatedOn: epochMs(value.updated_on),
    assigneeId: acNullableId(value.assignee_id),
    createdById: acNullableId(value.created_by_id),
    createdByName: asText(value.created_by_name) || null,
    assigneeName: assigneeNameOf(value),
    labels: acLabels(value.labels),
    commentCount: asNumber(value.comments_count) ?? 0,
    urlPath: asText(value.url_path) || `/projects/${projectId}/tasks/${id}`,
    taskListId: acNullableId(value.task_list_id)
  }
}

function normaliseComment(value: unknown): ActiveCollabComment | null {
  if (!acIsRecord(value)) {
    return null
  }
  const id = asNumber(value.id)
  if (id === null) {
    return null
  }
  return {
    id,
    bodyHtml: asText(value.body),
    // Comments get a plain-text rendering that tasks do not; the HTML stands in when it is absent.
    bodyPlainText: asText(value.body_plain_text) || asText(value.body),
    createdOn: epochMs(value.created_on),
    createdById: acNullableId(value.created_by_id),
    // The wire carries an author id, never an author object. Null beats inventing a join.
    createdByName: asText(value.created_by_name) || null,
    attachments: acAttachments(value.attachments)
  }
}

/**
 * Only keys the caller actually supplied are serialised. ActiveCollab reads an absent key as
 * "leave this field alone" and an explicit null as "clear it", so `undefined` must never become
 * null and null must never be dropped.
 */
function updatePayload(update: ActiveCollabTaskUpdate): Row {
  const payload: Row = {}
  if (update.name !== undefined) {
    payload.name = update.name
  }
  if (update.bodyHtml !== undefined) {
    payload.body = update.bodyHtml
  }
  if (update.assigneeId !== undefined) {
    payload.assignee_id = update.assigneeId
  }
  if (update.startOn !== undefined) {
    // Same date-only rule as due_on below: null clears, a number is the local calendar day.
    payload.start_on = update.startOn === null ? null : acDateForWrite(update.startOn)
  }
  if (update.dueOn !== undefined) {
    // null goes out as null — that is what clears the date. A number becomes the local calendar
    // day the user picked, because the server stores a date, not an instant.
    payload.due_on = update.dueOn === null ? null : acDateForWrite(update.dueOn)
  }
  if (update.labelNames !== undefined) {
    payload.labels = update.labelNames
  }
  return payload
}

/**
 * Creates one task in a project, optionally under a task list. `fields` rides the same
 * serialisation as an edit (dates as local calendar days, labels as bare names), so create and
 * update cannot drift; the caller guarantees `fields.name` is present.
 */
export async function createTask(args: {
  http: AcHttpClient
  projectId: number
  taskListId: number | null
  fields: ActiveCollabTaskUpdate
  /** Upload codes minted by the comment-attachment upload route; the create route quotes them the
   *  same way a comment does. */
  attachmentCodes?: readonly string[]
}): Promise<ActiveCollabTask | null> {
  const body = updatePayload(args.fields)
  // Omitted, not null: the "Other tasks" group has no list, and the server files a listless
  // create under the project's default list on its own.
  if (args.taskListId !== null) {
    body.task_list_id = args.taskListId
  }
  // Same rule as postComment: an empty list sends NO key at all.
  if (args.attachmentCodes !== undefined && args.attachmentCodes.length > 0) {
    body.attach_uploaded_files = [...args.attachmentCodes]
  }
  const response = await args.http.request<unknown>(`projects/${args.projectId}/tasks`, {
    method: 'POST',
    body
  })
  return normaliseTask(unwrapSingle(response.data))
}

/**
 * Field-level edit of one task.
 *
 * `update.labelNames` is a FULL REPLACEMENT set: the API overwrites whatever labels the task had,
 * so a caller adding one label must send the merged list, not the addition.
 */
export async function updateTask(args: {
  http: AcHttpClient
  projectId: number
  taskId: number
  update: ActiveCollabTaskUpdate
}): Promise<ActiveCollabTask | null> {
  const response = await args.http.request<unknown>(
    `projects/${args.projectId}/tasks/${args.taskId}`,
    { method: 'PUT', body: updatePayload(args.update) }
  )
  return normaliseTask(unwrapSingle(response.data))
}

/** Project-scopeless — see the file header. No body: the route itself is the instruction. */
export async function completeTask(args: {
  http: AcHttpClient
  taskId: number
}): Promise<ActiveCollabTask | null> {
  const response = await args.http.request<unknown>(`complete/task/${args.taskId}`, {
    method: 'PUT'
  })
  return normaliseTask(unwrapSingle(response.data))
}

/** The inverse of {@link completeTask}. `open`, not `reopen`: that is the route ActiveCollab maps. */
export async function reopenTask(args: {
  http: AcHttpClient
  taskId: number
}): Promise<ActiveCollabTask | null> {
  const response = await args.http.request<unknown>(`open/task/${args.taskId}`, { method: 'PUT' })
  return normaliseTask(unwrapSingle(response.data))
}

/**
 * `attachmentCodes` are `POST /upload-files` codes minted by comment-attachment-upload.ts, so the
 * upload has already happened by the time this runs — the codes are the only thing the comment
 * route understands. An empty list sends NO `attach_uploaded_files` key: a plain comment must post
 * exactly the body it always did, not the same body plus an empty array.
 */
export async function postComment(args: {
  http: AcHttpClient
  taskId: number
  bodyHtml: string
  attachmentCodes?: readonly string[]
}): Promise<ActiveCollabComment | null> {
  const codes = args.attachmentCodes ?? []
  const response = await args.http.request<unknown>(`comments/task/${args.taskId}`, {
    method: 'POST',
    body:
      codes.length === 0
        ? { body: args.bodyHtml }
        : { body: args.bodyHtml, attach_uploaded_files: [...codes] }
  })
  return normaliseComment(unwrapSingle(response.data))
}

/**
 * The vocabulary a label edit picks from. Task labels have their own endpoint because the bare
 * `labels` collection also carries project labels, which a task cannot wear.
 */
export async function listLabels(args: { http: AcHttpClient }): Promise<ActiveCollabLabel[]> {
  const payload = (await args.http.request<unknown>('labels/task-labels')).data
  if (Array.isArray(payload)) {
    return acLabels(payload)
  }
  // Collections arrive bare or inside a keyed envelope depending on the endpoint and the build.
  return acLabels(acIsRecord(payload) ? payload.labels : [])
}
