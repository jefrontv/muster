// Renderer transport for the ActiveCollab provider: one entry per `ActiveCollabApi` operation,
// dispatched to the preload bridge locally or to the identically-named runtime RPC method remotely.
//
// Two things this deliberately lacks that Jira has. No `siteId`: one token addresses one instance,
// so there is nothing to select. No `isRuntimeProviderSearchQueryWithinLimit` guard: this surface
// exposes no free-text search operation, so there is no unbounded query to clamp.

import type { GlobalSettings } from '../../../shared/types'
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
} from '../../../shared/activecollab-types'
import type {
  ActiveCollabAttachmentDownload,
  ActiveCollabAttachmentImage,
  ActiveCollabConnectArgs,
  ActiveCollabResult,
  ActiveCollabStagedFile,
  ActiveCollabTaskRef,
  ActiveCollabUploadedFile
} from '../../../shared/activecollab-api-types'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'
import {
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../shared/task-source-context'

export type RuntimeActiveCollabSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | TaskSourceContext
  | null
  | undefined

// Same split as Jira: an account probe is cheap, everything else can hit a slow instance.
const ACCOUNT_TIMEOUT_MS = 15_000
const OPERATION_TIMEOUT_MS = 30_000

function isTaskSourceRuntimeSettings(
  settings: RuntimeActiveCollabSettings
): settings is TaskSourceContext {
  return settings !== null && settings !== undefined && 'kind' in settings
}

function isActiveCollabResult<T>(value: unknown): value is ActiveCollabResult<T> {
  return (
    typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean'
  )
}

/**
 * The one throw barrier for this module. Both transports already answer `ActiveCollabResult`, so a
 * well-formed answer is returned untouched; every abnormal outcome — a missing bridge, an RPC
 * timeout, a runtime error envelope, a payload that is not a result at all — funnels into one
 * `unknown` failure, because a rejected promise crossing this boundary would strip the `kind` the
 * UI branches on.
 */
async function callActiveCollab<T>(
  method: string,
  params: unknown,
  settings: RuntimeActiveCollabSettings,
  timeoutMs: number,
  local: () => Promise<ActiveCollabResult<T>>
): Promise<ActiveCollabResult<T>> {
  // Why: task source context makes provider ownership explicit; legacy callers
  // still pass focused runtime settings until Tasks finishes migrating.
  const target = getActiveRuntimeTarget(
    isTaskSourceRuntimeSettings(settings) ? getTaskSourceRuntimeSettings(settings) : settings
  )
  try {
    const result =
      target.kind === 'environment'
        ? await callRuntimeRpc<ActiveCollabResult<T>>(target, method, params, { timeoutMs })
        : await local()
    if (!isActiveCollabResult<T>(result)) {
      throw new Error(`${method} returned a malformed response.`)
    }
    return result
  } catch (error) {
    return {
      ok: false,
      kind: 'unknown',
      error: error instanceof Error ? error.message : String(error),
      status: null
    }
  }
}

export async function activeCollabStatus(
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabConnectionStatus>> {
  return callActiveCollab('activecollab.status', undefined, settings, ACCOUNT_TIMEOUT_MS, () =>
    window.api.activecollab.status()
  )
}

export async function activeCollabConnect(
  args: ActiveCollabConnectArgs,
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabConnection>> {
  return callActiveCollab('activecollab.connect', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.connect(args)
  )
}

export async function activeCollabDisconnect(
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabConnectionStatus>> {
  return callActiveCollab('activecollab.disconnect', undefined, settings, ACCOUNT_TIMEOUT_MS, () =>
    window.api.activecollab.disconnect()
  )
}

export async function activeCollabListAssignedTasks(
  args?: { page?: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabTaskPage>> {
  return callActiveCollab(
    'activecollab.listAssignedTasks',
    args,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.listAssignedTasks(args)
  )
}

export async function activeCollabListProjects(
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabProject[]>> {
  return callActiveCollab(
    'activecollab.listProjects',
    undefined,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.listProjects()
  )
}

export async function activeCollabListProjectTasks(
  args: { projectId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabProjectTasks>> {
  return callActiveCollab(
    'activecollab.listProjectTasks',
    args,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.listProjectTasks(args)
  )
}

export async function activeCollabGetTaskDetail(
  args: ActiveCollabTaskRef,
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabTaskDetail>> {
  return callActiveCollab('activecollab.getTaskDetail', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.getTaskDetail(args)
  )
}

export async function activeCollabGetAttachmentImage(
  args: { attachmentId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabAttachmentImage>> {
  return callActiveCollab(
    'activecollab.getAttachmentImage',
    args,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.getAttachmentImage(args)
  )
}

/**
 * The throw barrier for a LOCAL-ONLY operation — one that never consults the runtime target
 * because its subject is a file on THIS machine.
 *
 * Routing any of these to a remote host would stat, read or write that host's disk and answer
 * about files nobody here can see, the same reason PDF export and browser downloads stay local.
 * The barrier is still needed: a rejected bridge call would strip the `kind` the UI branches on.
 */
async function callLocalActiveCollab<T>(
  method: string,
  local: () => Promise<ActiveCollabResult<T>>
): Promise<ActiveCollabResult<T>> {
  try {
    const result = await local()
    if (!isActiveCollabResult<T>(result)) {
      throw new Error(`${method} returned a malformed response.`)
    }
    return result
  } catch (error) {
    return {
      ok: false,
      kind: 'unknown',
      error: error instanceof Error ? error.message : String(error),
      status: null
    }
  }
}

export async function activeCollabDownloadAttachment(args: {
  attachmentId: number
  name: string
}): Promise<ActiveCollabResult<ActiveCollabAttachmentDownload>> {
  return callLocalActiveCollab('activecollab.downloadAttachment', () =>
    window.api.activecollab.downloadAttachment(args)
  )
}

/** Empty means the picker was dismissed, which is not a failure. */
export async function activeCollabPickCommentAttachments(): Promise<
  ActiveCollabResult<ActiveCollabStagedFile[]>
> {
  return callLocalActiveCollab('activecollab.pickCommentAttachments', () =>
    window.api.activecollab.pickCommentAttachments()
  )
}

export async function activeCollabDescribeCommentAttachments(args: {
  paths: string[]
}): Promise<ActiveCollabResult<ActiveCollabStagedFile[]>> {
  return callLocalActiveCollab('activecollab.describeCommentAttachments', () =>
    window.api.activecollab.describeCommentAttachments(args)
  )
}

export async function activeCollabUploadCommentAttachments(args: {
  paths: string[]
}): Promise<ActiveCollabResult<ActiveCollabUploadedFile[]>> {
  return callLocalActiveCollab('activecollab.uploadCommentAttachments', () =>
    window.api.activecollab.uploadCommentAttachments(args)
  )
}

export async function activeCollabCreateTask(
  args: { projectId: number; name: string; taskListId: number | null },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return callActiveCollab('activecollab.createTask', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.createTask(args)
  )
}

export async function activeCollabUpdateTask(
  args: ActiveCollabTaskRef & { update: ActiveCollabTaskUpdate },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return callActiveCollab('activecollab.updateTask', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.updateTask(args)
  )
}

export async function activeCollabCompleteTask(
  args: { taskId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return callActiveCollab('activecollab.completeTask', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.completeTask(args)
  )
}

export async function activeCollabReopenTask(
  args: { taskId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return callActiveCollab('activecollab.reopenTask', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.reopenTask(args)
  )
}

export async function activeCollabPostComment(
  args: { taskId: number; bodyHtml: string; attachmentCodes?: string[] },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabComment | null>> {
  return callActiveCollab('activecollab.postComment', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.postComment(args)
  )
}

export async function activeCollabListLabels(
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabLabel[]>> {
  return callActiveCollab(
    'activecollab.listLabels',
    undefined,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.listLabels()
  )
}

export async function activeCollabListUsers(
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabUser[]>> {
  return callActiveCollab('activecollab.listUsers', undefined, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.listUsers()
  )
}

export async function activeCollabListProjectMembers(
  args: { projectId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabUser[]>> {
  return callActiveCollab(
    'activecollab.listProjectMembers',
    args,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.listProjectMembers(args)
  )
}
