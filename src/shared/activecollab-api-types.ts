// The renderer's view of the ActiveCollab provider. Lives in shared/ (like
// site-clone-sources-api-types.ts) because the preload type surface is compiled into the browser
// project and must not reach into main, where the HTTP client and the stored token live.
//
// No `siteId` appears anywhere: one ActiveCollab token addresses exactly one instance, so the
// multi-site fan-out Jira threads through all nineteen of its operations has nothing to select.

import type {
  ActiveCollabComment,
  ActiveCollabConnection,
  ActiveCollabConnectionStatus,
  ActiveCollabLabel,
  ActiveCollabProject,
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabTaskPage,
  ActiveCollabTaskUpdate
} from './activecollab-types'

/**
 * Why a call failed, so the UI can pick the right recovery instead of one generic error toast.
 *
 * `auth` and `not-configured` both end at the connect dialog but say different things: the first
 * had a token the instance rejected (reconnect), the second never had one (connect). `api` is the
 * instance answering with a fault the user cannot fix by re-authenticating.
 */
export type ActiveCollabFailureKind =
  | 'not-configured'
  | 'auth'
  | 'invalid-request'
  | 'api'
  | 'unknown'

/**
 * Tagged result, never a thrown error: handlers must not reject across the bridge, because an
 * unhandled rejection in the renderer loses the reason the UI needs to branch on.
 *
 * `status` is the HTTP status when one exists and null otherwise, kept non-optional so a caller
 * reading it never has to distinguish "absent" from "not applicable".
 */
export type ActiveCollabFailure = {
  ok: false
  kind: ActiveCollabFailureKind
  error: string
  status: number | null
}

export type ActiveCollabResult<T> = { ok: true; value: T } | ActiveCollabFailure

export type ActiveCollabConnectArgs = {
  instanceUrl: string
  email: string
  password: string
}

export type ActiveCollabTaskRef = {
  projectId: number
  taskId: number
}

export type ActiveCollabApi = {
  /** Never fails in practice: "not connected" and "cannot decrypt" are both `ok: true` states. */
  status: () => Promise<ActiveCollabResult<ActiveCollabConnectionStatus>>
  connect: (args: ActiveCollabConnectArgs) => Promise<ActiveCollabResult<ActiveCollabConnection>>
  /** Answers the post-clear status so the settings pane needs no follow-up read. */
  disconnect: () => Promise<ActiveCollabResult<ActiveCollabConnectionStatus>>
  /**
   * Open tasks assigned to the connected user. Pages are server-capped at
   * `ACTIVECOLLAB_PAGE_SIZE`; a `limit` has no effect, so only `page` is offered.
   */
  listAssignedTasks: (args?: { page?: number }) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>
  listProjects: () => Promise<ActiveCollabResult<ActiveCollabProject[]>>
  getTaskDetail: (args: ActiveCollabTaskRef) => Promise<ActiveCollabResult<ActiveCollabTaskDetail>>
  /**
   * `update.labelNames` is a FULL REPLACEMENT set — the API overwrites the task's labels — so a
   * caller adding one label sends the merged list, not the addition.
   *
   * Resolves `ok: true` with a null value when the write landed but the instance echoed no usable
   * row. That is a refetch, not a failure.
   */
  updateTask: (
    args: ActiveCollabTaskRef & { update: ActiveCollabTaskUpdate }
  ) => Promise<ActiveCollabResult<ActiveCollabTask | null>>
  /** Project-scopeless upstream, so a task id is the whole address. */
  completeTask: (args: { taskId: number }) => Promise<ActiveCollabResult<ActiveCollabTask | null>>
  reopenTask: (args: { taskId: number }) => Promise<ActiveCollabResult<ActiveCollabTask | null>>
  postComment: (args: {
    taskId: number
    bodyHtml: string
  }) => Promise<ActiveCollabResult<ActiveCollabComment | null>>
  /** The label vocabulary a `updateTask` label edit chooses from. */
  listLabels: () => Promise<ActiveCollabResult<ActiveCollabLabel[]>>
}
