// Reads for the ActiveCollab task provider: assigned tasks, the project list, and task detail.
//
// Three server behaviours are absorbed here rather than leaked to callers:
//   - Task filtering is not implemented server-side. `completed`/`assignee_id`/`search` query
//     params are accepted and ignored, so completed tasks are dropped client-side.
//   - Collections cap at 100 rows per page whatever limit is asked for, and the page totals live in
//     response headers. `hasMore` therefore comes from the headers, never from the array length.
//   - `GET projects/{p}/tasks/{t}/comments` 500s on the target instance, so comments are read from
//     the inline array on the task-detail response and the dedicated endpoint is a fallback only.

import {
  ACTIVECOLLAB_PAGE_SIZE,
  type ActiveCollabAttachment,
  type ActiveCollabComment,
  type ActiveCollabProject,
  type ActiveCollabProjectTasks,
  type ActiveCollabTask,
  type ActiveCollabTaskDetail,
  type ActiveCollabTaskList,
  type ActiveCollabTaskPage
} from '../../shared/activecollab-types'
import { acEpochToLocalDay } from '../../shared/activecollab-dates'
import { acAttachments, acCollection, acIsRecord, acLabels, acNullableId } from './codecs'
import type { AcHttpClient, AcResponse } from './http'

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

/**
 * The name the ROW carried, or null. ActiveCollab omits both spellings on every task row this
 * instance serves, so the id-to-name join in `name-directory.ts` fills the gap afterwards — but a
 * name the server did send always wins, because it needs no lookup and cannot be stale.
 */
function assigneeNameOf(row: Record<string, unknown>): string | null {
  const direct = asText(row.assignee_name)
  if (direct.length > 0) {
    return direct
  }
  const names = row.assignee_names
  const first = Array.isArray(names) ? asText(names[0]) : ''
  return first.length > 0 ? first : null
}

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
    // Absent on every row this instance serves; the name-directory join fills it in afterwards.
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
    assigneeName: assigneeNameOf(value),
    createdById: acNullableId(value.created_by_id),
    createdByName: asText(value.created_by_name) || null,
    labels: acLabels(value.labels),
    commentCount: asNumber(value.comments_count) ?? 0,
    urlPath: asText(value.url_path) || `/projects/${projectId}/tasks/${id}`,
    taskListId: acNullableId(value.task_list_id),
    isHiddenFromClients: value.is_hidden_from_clients === true
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

function normaliseComments(payload: unknown): ActiveCollabComment[] {
  const comments: ActiveCollabComment[] = []
  for (const entry of acCollection(payload, 'comments')) {
    const comment = normaliseComment(entry)
    if (comment !== null) {
      comments.push(comment)
    }
  }
  return comments
}

/**
 * Derived from the `X-Angie-Pagination*` headers, never from how many rows came back: the server
 * caps every page at 100 whatever limit was asked for, and completed tasks are filtered off after
 * the response lands, so a short list proves nothing about whether another page exists.
 */
function hasMorePages(
  response: AcResponse<unknown>,
  requestedPage: number,
  rowCount: number
): boolean {
  const perPage =
    response.perPage !== null && response.perPage > 0 ? response.perPage : ACTIVECOLLAB_PAGE_SIZE
  if (response.totalItems !== null) {
    const page = response.page !== null && response.page > 0 ? response.page : requestedPage
    return page * perPage < response.totalItems
  }
  // Headers absent: a page that came back full is the only one that can have a successor.
  return rowCount >= perPage
}

export async function listAssignedTasks(args: {
  http: AcHttpClient
  userId: number
  page?: number
}): Promise<ActiveCollabTaskPage> {
  const page = args.page !== undefined && args.page > 1 ? Math.trunc(args.page) : 1
  const response = await args.http.request<unknown>(`users/${args.userId}/tasks`, {
    query: { page }
  })
  const rows = acCollection(response.data, 'tasks')
  const tasks: ActiveCollabTask[] = []
  for (const row of rows) {
    const task = normaliseTask(row)
    // Client-side because the server ignores a `completed` filter and returns closed tasks anyway.
    if (task !== null && !task.isCompleted) {
      tasks.push(task)
    }
  }
  return {
    tasks,
    totalItems: response.totalItems,
    hasMore: hasMorePages(response, page, rows.length),
    page: response.page
  }
}

/** Pages a project can span before the read stops: 10 × the 100-row server cap. */
const PROJECT_TASK_PAGE_LIMIT = 10

function normaliseTaskLists(payload: unknown): ActiveCollabTaskList[] {
  const lists: ActiveCollabTaskList[] = []
  for (const entry of acCollection(payload, 'task_lists')) {
    if (!acIsRecord(entry)) {
      continue
    }
    const id = asNumber(entry.id)
    if (id === null) {
      continue
    }
    lists.push({ id, name: asText(entry.name) })
  }
  return lists
}

/**
 * Every open task in one project, with the project's task lists for grouping. The task-list
 * sidecar rides the first tasks page on instances that send it; the dedicated endpoint fills in
 * when it does not, and its failure only costs the group names, never the tasks.
 */
export async function listProjectTasks(args: {
  http: AcHttpClient
  projectId: number
}): Promise<ActiveCollabProjectTasks> {
  const tasks: ActiveCollabTask[] = []
  const seenIds = new Set<number>()
  let taskLists: ActiveCollabTaskList[] = []
  for (let page = 1; page <= PROJECT_TASK_PAGE_LIMIT; page += 1) {
    const response = await args.http.request<unknown>(`projects/${args.projectId}/tasks`, {
      query: { page }
    })
    const rows = acCollection(response.data, 'tasks')
    let added = 0
    for (const row of rows) {
      const task = normaliseTask(row)
      // Client-side because the server ignores a `completed` filter and returns closed tasks anyway.
      if (task === null || task.isCompleted || seenIds.has(task.id)) {
        continue
      }
      seenIds.add(task.id)
      tasks.push(task)
      added += 1
    }
    if (page === 1) {
      taskLists = normaliseTaskLists(response.data)
    }
    // Why: some instances ignore `page` on this endpoint (same class of bug as /users) and
    // reprint page 1. Headers still claim more pages, so without this we staple the same
    // 100 rows until PROJECT_TASK_PAGE_LIMIT and the project view shows each task N times.
    if (page > 1 && added === 0) {
      break
    }
    if (response.page !== null && response.page > 0 && response.page < page) {
      break
    }
    if (!hasMorePages(response, page, rows.length)) {
      break
    }
  }
  if (taskLists.length === 0) {
    try {
      const response = await args.http.request<unknown>(`projects/${args.projectId}/task-lists`)
      taskLists = normaliseTaskLists(response.data)
    } catch {
      // Group names degrade to "Other tasks"; the tasks themselves already loaded.
    }
  }
  return { projectId: args.projectId, tasks, taskLists }
}

export async function listProjects(args: { http: AcHttpClient }): Promise<ActiveCollabProject[]> {
  const response = await args.http.request<unknown>('projects')
  const projects: ActiveCollabProject[] = []
  for (const entry of acCollection(response.data, 'projects')) {
    if (!acIsRecord(entry)) {
      continue
    }
    const id = asNumber(entry.id)
    if (id === null) {
      continue
    }
    projects.push({
      id,
      name: asText(entry.name),
      isCompleted: entry.is_completed === true || epochMs(entry.completed_on) !== null,
      // Already on the list payload, so a sidebar badge costs no extra request.
      openTaskCount: asNumber(entry.count_tasks)
    })
  }
  return projects
}

/**
 * Fallback only. The dedicated endpoint 500s on the target instance ("Failed to match path"), so a
 * failure degrades to an empty thread: the task itself already loaded and losing its comments must
 * not lose the whole detail view.
 */
async function readFallbackComments(
  http: AcHttpClient,
  taskPath: string
): Promise<ActiveCollabComment[]> {
  try {
    return normaliseComments((await http.request<unknown>(`${taskPath}/comments`)).data)
  } catch {
    return []
  }
}

/**
 * Task attachments sit at the TOP LEVEL of the detail envelope, a sibling of `single`; alternate
 * response shapes nest them on the task record instead, so both are read.
 */
function taskAttachments(payload: unknown, row: unknown): ActiveCollabAttachment[] {
  const sidecar = acAttachments(acIsRecord(payload) ? payload.attachments : undefined)
  return sidecar.length > 0 ? sidecar : acAttachments(acIsRecord(row) ? row.attachments : undefined)
}

export async function getTaskDetail(args: {
  http: AcHttpClient
  projectId: number
  taskId: number
}): Promise<ActiveCollabTaskDetail> {
  const taskPath = `projects/${args.projectId}/tasks/${args.taskId}`
  const payload = (await args.http.request<unknown>(taskPath)).data
  // Single-object reads are wrapped as `{ single: {...}, comments: [...], <sidecars> }`.
  const row = acIsRecord(payload) ? (payload.single ?? payload) : payload
  const task = normaliseTask(row)
  if (task === null) {
    throw new Error(`ActiveCollab task ${args.taskId} was not found in project ${args.projectId}.`)
  }
  const inline = normaliseComments(payload)
  return {
    task,
    comments: inline.length > 0 ? inline : await readFallbackComments(args.http, taskPath),
    attachments: taskAttachments(payload, row)
  }
}
