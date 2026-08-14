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
  ActiveCollabProjectTasks,
  ActiveCollabTaskPage,
  ActiveCollabTaskUpdate,
  ActiveCollabUser
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
  /** The request never reached the instance — offline, DNS, or a timed-out socket. Retryable by
   *  definition, and must not be dressed as an instance fault ("reconnecting will not fix"). */
  | 'network'
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

/**
 * An attachment's bytes, already inlined. Built in MAIN from an authenticated fetch: a raw
 * instance URL in the renderer cannot authenticate, and a tokenised one would leak the credential
 * into the DOM, the devtools network pane, and every crash report.
 */
export type ActiveCollabAttachmentImage = {
  /** `data:<mime>;base64,…`, assignable straight to an `<img src>`. */
  dataUrl: string
  mimeType: string
}

/**
 * The outcome of saving an attachment to disk. The bytes are NOT here: main streamed them into the
 * file itself, and only the result crosses the bridge.
 *
 * Dismissing the save dialog answers `ok: true` with `cancelled`, not a failure. The user changing
 * their mind is a normal outcome and must not surface as an error.
 */
export type ActiveCollabAttachmentDownload =
  | { status: 'saved'; filePath: string; fileName: string; directory: string }
  | { status: 'cancelled' }

/**
 * A file the user picked or dropped, described from THIS machine's disk BEFORE anything is
 * uploaded, so the composer can show a name and a size next to a staged row.
 *
 * `rejected` is non-null when the file can never be sent. Surfacing that here — rather than
 * discovering it mid-upload — is what lets the user drop the offending file and post the rest.
 */
export type ActiveCollabStagedFile = {
  path: string
  name: string
  size: number
  rejected: 'too-large' | 'unreadable' | null
}

/** One uploaded file. `code` is what a write quotes in `attach_uploaded_files`. */
export type ActiveCollabUploadedFile = {
  path: string
  name: string
  size: number
  code: string
}

/**
 * How many changes the connected user has not looked at yet, as the sidebar badge needs it: one
 * number to draw, and one per task so opening a task can be recognised as reading it.
 *
 * `byTask` is keyed by task id as a STRING, which is what survives the JSON round trip main stores
 * it through. A task with nothing unread is absent, never zero, so `total` is exactly the sum.
 */
export type ActiveCollabUnread = {
  total: number
  byTask: Record<string, number>
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
  /** Every open task in one project plus its task lists, for the project drill-in view. */
  listProjectTasks: (args: {
    projectId: number
  }) => Promise<ActiveCollabResult<ActiveCollabProjectTasks>>
  getTaskDetail: (args: ActiveCollabTaskRef) => Promise<ActiveCollabResult<ActiveCollabTaskDetail>>
  /**
   * One image attachment, inlined. Non-images and anything past the size cap answer an
   * `invalid-request` failure rather than being buffered or silently base64'd.
   */
  getAttachmentImage: (args: {
    attachmentId: number
  }) => Promise<ActiveCollabResult<ActiveCollabAttachmentImage>>
  /**
   * Saves one attachment to a path the user picks, then reveals it.
   *
   * LOCAL ONLY, with no runtime RPC twin: the save dialog and the reveal both belong to this
   * window, so a remote runtime would write the file to its own disk and hand back a path nothing
   * here can open. Unlike {@link getAttachmentImage} this carries no payload in either direction,
   * which is why it has no size cap worth mentioning to a caller and works for a large archive.
   */
  downloadAttachment: (args: {
    attachmentId: number
    name: string
  }) => Promise<ActiveCollabResult<ActiveCollabAttachmentDownload>>
  /**
   * Opens a native multi-select picker and describes what was chosen. An EMPTY array means the
   * dialog was dismissed.
   *
   * LOCAL ONLY, no runtime RPC twin, for the reason {@link downloadAttachment} has none: every
   * path here names a file on the disk of the machine the user is looking at, and a remote host
   * would read its own.
   */
  pickCommentAttachments: () => Promise<ActiveCollabResult<ActiveCollabStagedFile[]>>
  /** The same description for paths that arrived by drag and drop. LOCAL ONLY. */
  describeCommentAttachments: (args: {
    paths: string[]
  }) => Promise<ActiveCollabResult<ActiveCollabStagedFile[]>>
  /**
   * Reads each path in main and uploads it, answering one code per file, in the order given.
   *
   * Never partial and never optimistic: an instance that answers HTTP 200 without an upload code
   * fails the whole call, because a comment posted against a missing code loses the file with no
   * error anywhere. LOCAL ONLY.
   */
  uploadCommentAttachments: (args: {
    paths: string[]
  }) => Promise<ActiveCollabResult<ActiveCollabUploadedFile[]>>
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
  /**
   * `attachmentCodes` are {@link uploadCommentAttachments} codes. Omitted or empty sends no
   * `attach_uploaded_files` key at all, which is what an instance expects for a plain comment.
   */
  postComment: (args: {
    taskId: number
    bodyHtml: string
    attachmentCodes?: string[]
  }) => Promise<ActiveCollabResult<ActiveCollabComment | null>>
  /** The label vocabulary a `updateTask` label edit chooses from. */
  listLabels: () => Promise<ActiveCollabResult<ActiveCollabLabel[]>>
  /**
   * The @mention roster for the whole instance. Fetched lazily — a comment written without an `@`
   * never asks for it — and answered from the same credential-keyed window that labels assignees.
   */
  listUsers: () => Promise<ActiveCollabResult<ActiveCollabUser[]>>
  /**
   * The members of one project, named, so a mention menu offers the people on the task rather than
   * all 176 accounts on the instance.
   *
   * An EMPTY array is a real answer and NOT an error: a fetch fault, a membership the roster cannot
   * name, and a project with no members all arrive this way, and the caller is expected to fall
   * back to {@link listUsers} rather than present a menu that reads as "nobody exists".
   */
  listProjectMembers: (args: {
    projectId: number
  }) => Promise<ActiveCollabResult<ActiveCollabUser[]>>
  /**
   * How much the connected user has not read yet, for the sidebar badge.
   *
   * LOCAL ONLY with no runtime RPC twin, like {@link downloadAttachment}: the counts are a file this
   * machine's poll loop maintains against this machine's keychain, and a remote host holds its own.
   * A disconnected app answers a zero count, not a failure.
   */
  unread: () => Promise<ActiveCollabResult<ActiveCollabUnread>>
  /**
   * Clears one task's unread entry — what opening it in the detail pane means — and answers the
   * counts that remain. Per task, never per page: opening a list is not reading anything. LOCAL ONLY.
   */
  markTaskRead: (args: { taskId: number }) => Promise<ActiveCollabResult<ActiveCollabUnread>>
  /** Main pushes the new counts whenever a poll or a read moves them. Answers its unsubscribe. */
  onUnreadChanged: (callback: (unread: ActiveCollabUnread) => void) => () => void
}
