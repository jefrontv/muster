// Renderer transport for the ActiveCollab provider: one entry per `ActiveCollabApi` operation,
// dispatched to the preload bridge locally or to the identically-named runtime RPC method remotely.
//
// Two things this deliberately lacks that Jira has. No `siteId`: one token addresses one instance,
// so there is nothing to select. Search is the one free-text surface, and it is clamped here with
// the same `isRuntimeProviderSearchQueryWithinLimit` guard Jira uses before a pasted query is
// dispatched.
//
// Writes live in runtime-activecollab-writes.ts and the throw barrier lives in
// runtime-activecollab-transport.ts; both are re-exported here so callers keep one import path.

import type {
  ActiveCollabConnection,
  ActiveCollabConnectionStatus,
  ActiveCollabLabel,
  ActiveCollabProject,
  ActiveCollabProjectTasks,
  ActiveCollabTaskDetail,
  ActiveCollabTaskPage,
  ActiveCollabUpdates,
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
import {
  ACCOUNT_TIMEOUT_MS,
  OPERATION_TIMEOUT_MS,
  callActiveCollab,
  isActiveCollabResult,
  type RuntimeActiveCollabSettings
} from './runtime-activecollab-transport'

export type { RuntimeActiveCollabSettings } from './runtime-activecollab-transport'
export * from './runtime-activecollab-writes'

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

export async function activeCollabListUpdates(
  args?: { page?: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabUpdates>> {
  return callActiveCollab('activecollab.listUpdates', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.listUpdates(args)
  )
}
