// Wire and view types for the ActiveCollab task provider.
//
// These are the NORMALISED shapes the rest of Muster sees. ActiveCollab's raw JSON is materially
// messier and every quirk is absorbed at the codec boundary rather than leaked upward:
//   - timestamps arrive as epoch seconds but must be WRITTEN as "YYYY-MM-DD"
//   - `due_on` is UTC midnight and has to be re-anchored to the local calendar or it reads a day
//     early for anyone east of UTC
//   - `0` is the null sentinel for assignee/task-list/job-type ids — it is not "user 0"
//   - labels are returned as objects but written as bare name strings, and a write REPLACES the set
//   - comments are only reliably available inline on the task-detail response

/** One instance per token: ActiveCollab has no multi-site concept, unlike Jira. */
export type ActiveCollabConnection = {
  instanceUrl: string
  userId: number
  userName: string
  userEmail: string
}

export type ActiveCollabConnectionStatus = {
  configured: boolean
  connection: ActiveCollabConnection | null
  /** Empty when configured. Otherwise a sentence the user can act on. */
  reason: string
}

/**
 * A mentionable person. Id addresses them in a `new_mention` span, name is what the author types.
 * Email is deliberately absent: the composer matches on the name it inserts, and shipping every
 * colleague's address to the renderer widens the roster's blast radius for no matching power.
 */
export type ActiveCollabUser = {
  id: number
  name: string
  /** Instance avatar URL with any size placeholder resolved; null when the wire omitted it. */
  avatarUrl: string | null
}

export type ActiveCollabLabel = {
  id: number
  name: string
  /** Nullable upstream; callers should fall back to a neutral chip colour. */
  color: string | null
}

export type ActiveCollabProject = {
  id: number
  name: string
  isCompleted: boolean
  /** Present on the list endpoint, so a sidebar badge costs no extra request. */
  openTaskCount: number | null
}

export type ActiveCollabTask = {
  id: number
  projectId: number
  projectName: string
  /** Per-project number shown in the UI; NOT unique across projects. */
  taskNumber: number
  name: string
  /** HTML. ActiveCollab has no plain-text variant on tasks, only on comments. */
  bodyHtml: string
  isCompleted: boolean
  /** Epoch ms, already re-anchored to the local calendar day. Null when unset. */
  startOn: number | null
  /** Epoch ms, already re-anchored to the local calendar day. Null when unset. */
  dueOn: number | null
  createdOn: number | null
  updatedOn: number | null
  assigneeId: number | null
  assigneeName: string | null
  createdById: number | null
  /** Filled by the name-directory join when the wire omits it, like assigneeName. */
  createdByName: string | null
  labels: ActiveCollabLabel[]
  commentCount: number
  /** ActiveCollab's single priority flag; there is no priority ladder. */
  isImportant: boolean
  /** Estimated hours (the API's own unit). Null when the instance disables estimates or none set. */
  estimate: number | null
  /** Job type the estimate is priced under; null when unset (`0` sentinel absorbed at the codec). */
  jobTypeId: number | null
  /** Subtask progress as the LIST rows carry it. Null when this instance omits the counts. */
  openSubtaskCount: number | null
  totalSubtaskCount: number | null
  /** Relative, e.g. `/projects/3790/tasks/509323`. Join with instanceUrl for a permalink. */
  urlPath: string
  taskListId: number | null
  /** ActiveCollab's per-object client visibility; hidden tasks never appear to client-role users. */
  isHiddenFromClients: boolean
}

/**
 * A checklist item under one task. Subtasks arrive INLINE on the task-detail response; there is
 * no cross-project subtask read. Completion routes are project-scopeless like a task's.
 */
export type ActiveCollabSubtask = {
  id: number
  taskId: number
  name: string
  isCompleted: boolean
  assigneeId: number | null
  /** Filled by the name-directory join when the wire omits it, like a task's assigneeName. */
  assigneeName: string | null
  /** Epoch ms, re-anchored to the local calendar day like a task's dueOn. Null when unset. */
  dueOn: number | null
  createdOn: number | null
}

/**
 * A file hanging off a task or a comment. Attachments arrive INLINE on the task-detail payload —
 * there is no reachable per-task attachments endpoint on the target instance.
 */
export type ActiveCollabAttachment = {
  id: number
  name: string
  mimeType: string
  size: number
  /** True when mimeType is an image/* the renderer is willing to inline. */
  isImage: boolean
}

export type ActiveCollabComment = {
  id: number
  bodyHtml: string
  /** ActiveCollab gives comments a plain-text rendering that tasks do not get. */
  bodyPlainText: string
  createdOn: number | null
  createdById: number | null
  createdByName: string | null
  attachments: ActiveCollabAttachment[]
}

/** Task plus the parts that only arrive on the detail response. */
export type ActiveCollabTaskDetail = {
  task: ActiveCollabTask
  comments: ActiveCollabComment[]
  /** The task's own attachments; a comment carries its own list. */
  attachments: ActiveCollabAttachment[]
  /** In the task's own order. Empty when the instance sends none. */
  subtasks: ActiveCollabSubtask[]
  /** Watchers. User ids only; the renderer joins names off the roster it already holds. */
  subscriberIds: number[]
  /** Hours logged against the task, same unit as `estimate`. Null when the instance omits it. */
  trackedTime: number | null
}

export type ActiveCollabTaskPage = {
  tasks: ActiveCollabTask[]
  /** From `X-Angie-PaginationTotalItems`; null when the header was absent. */
  totalItems: number | null
  /** True when more pages exist. ActiveCollab caps every page at 100 regardless of any limit. */
  hasMore: boolean
  /** The page the server SAYS it answered (`X-Angie-PaginationCurrentPage`). Some instances
   *  ignore `page` and reprint page 1; callers that page use this echo to detect it. */
  page?: number | null
}

/** A task list (section) within a project, in the project's own order. */
export type ActiveCollabTaskList = {
  id: number
  name: string
}

/** Every open task in one project plus the task lists they group under. */
export type ActiveCollabProjectTasks = {
  projectId: number
  tasks: ActiveCollabTask[]
  taskLists: ActiveCollabTaskList[]
}

/**
 * The category an object-update row collapsed onto. `other` deliberately absorbs any key the
 * instance sends that this build predates, so a future ActiveCollab update kind still reads as
 * activity instead of being dropped.
 */
export type ActiveCollabUpdateKind = 'comment' | 'mention' | 'created' | 'reassigned' | 'other'

/**
 * One recently-updated task from `notifications/object-updates`. Only `Task` rows survive: the
 * panel can open tasks and nothing else, so a Note or Discussion row is dropped at the codec.
 */
export type ActiveCollabObjectUpdate = {
  taskId: number
  projectId: number
  /** Joined from `related.Project`; empty string when the sidecar omitted it. */
  projectName: string
  taskNumber: number | null
  name: string
  /** Epoch ms, from `last_update_on`. Null when absent. */
  lastUpdateOn: number | null
  /** Collapsed from the wire's keyed-object-or-empty-array `updates`. */
  kinds: { kind: ActiveCollabUpdateKind; count: number }[]
  isSubscribed: boolean
}

/** Recently-updated tasks, newest first. Never cached: the list is time-sensitive. */
export type ActiveCollabUpdates = {
  updates: ActiveCollabObjectUpdate[]
  /** Null when the instance sent `-1` — "not computed", which is NOT zero. */
  totalUnread: number | null
  hasMore: boolean
}

/** Every collection endpoint is capped here by the server; a `limit` parameter is ignored. */
export const ACTIVECOLLAB_PAGE_SIZE = 100

/** Field-level edits. Omitted keys are left alone; `null` explicitly CLEARS a field. */
export type ActiveCollabTaskUpdate = {
  name?: string
  bodyHtml?: string
  assigneeId?: number | null
  startOn?: number | null
  dueOn?: number | null
  /**
   * Full replacement set of label NAMES, because that is what the API accepts and it overwrites
   * whatever was there. Callers wanting to add one label must send the merged list.
   */
  labelNames?: string[]
  isHiddenFromClients?: boolean
  isImportant?: boolean
}

/** Field-level subtask edits, same omitted-vs-null contract as {@link ActiveCollabTaskUpdate}. */
export type ActiveCollabSubtaskUpdate = {
  name?: string
  assigneeId?: number | null
  dueOn?: number | null
}
