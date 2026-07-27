// IPC for the ActiveCollab task provider, and the operation layer both transports share.
//
// The exported `ac*` functions are the whole provider surface: each validates untrusted arguments,
// builds an AcHttpClient from the stored credential, and answers a tagged result. The ipcMain
// handlers (local window) and OrcaRuntimeService (remote host, over runtime RPC) both call them,
// so the boundary rules are written once instead of once per transport. The per-call context they
// share lives in activecollab-operation-context.ts; the two people reads live in
// activecollab-people.ts, which needs that context too.
//
// Nothing here throws. A malformed argument, a missing credential and a rejected token are all
// results the renderer branches on — an unhandled rejection crossing the bridge loses the reason
// the UI needs to pick between "reconnect", "fix your input", and "the server is unwell".
//
// No siteId appears anywhere: one ActiveCollab token addresses exactly one instance.

import { ipcMain } from 'electron'
import type {
  ActiveCollabAttachmentImage,
  ActiveCollabResult
} from '../../shared/activecollab-api-types'
import type {
  ActiveCollabComment,
  ActiveCollabConnection,
  ActiveCollabConnectionStatus,
  ActiveCollabLabel,
  ActiveCollabProject,
  ActiveCollabTask,
  ActiveCollabTaskDetail,
  ActiveCollabTaskPage
} from '../../shared/activecollab-types'
import { connectActiveCollab } from '../activecollab/auth'
import {
  clearActiveCollabCredential,
  getActiveCollabConnectionStatus
} from '../activecollab/credential-store'
import { acResolveTaskNames, resetAcNameDirectoryCache } from '../activecollab/name-directory'
import { resetAcProjectMembersCache } from '../activecollab/project-members'
import { getAttachmentImage } from '../activecollab/attachment-image'
import {
  completeTask,
  listLabels,
  postComment,
  reopenTask,
  updateTask
} from '../activecollab/mutations'
import { getTaskDetail, listAssignedTasks, listProjects } from '../activecollab/tasks'
import {
  boundedText,
  InvalidRequestError,
  MAX_BODY,
  MAX_EMAIL,
  MAX_SECRET,
  MAX_URL,
  pageNumber,
  positiveId,
  record,
  taskRef,
  taskUpdate
} from './activecollab-argument-validation'
import { acClient, guard, toFailure } from './activecollab-operation-context'
import { acListProjectMembers, acListUsers } from './activecollab-people'
import { _resetPreflightCache } from './preflight'

const ACTIVECOLLAB_CHANNELS = [
  'activecollab:status',
  'activecollab:connect',
  'activecollab:disconnect',
  'activecollab:listAssignedTasks',
  'activecollab:listProjects',
  'activecollab:getTaskDetail',
  'activecollab:getAttachmentImage',
  'activecollab:updateTask',
  'activecollab:completeTask',
  'activecollab:reopenTask',
  'activecollab:postComment',
  'activecollab:listLabels',
  'activecollab:listUsers',
  'activecollab:listProjectMembers'
] as const

export function acStatus(): Promise<ActiveCollabResult<ActiveCollabConnectionStatus>> {
  return guard(async () => getActiveCollabConnectionStatus())
}

export async function acConnect(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabConnection>> {
  try {
    const input = record(args)
    const instanceUrl = boundedText(input.instanceUrl, 'instanceUrl', MAX_URL).trim()
    const email = boundedText(input.email, 'email', MAX_EMAIL).trim()
    // Deliberately not trimmed: spaces are legal in a password, and stripping them turns a correct
    // credential into an unexplainable sign-in failure.
    const password = boundedText(input.password, 'password', MAX_SECRET)
    if (instanceUrl === '' || email === '' || password === '') {
      throw new InvalidRequestError('Instance URL, email, and password are required.')
    }
    const result = await connectActiveCollab({ baseUrl: instanceUrl, email, password })
    if (!result.ok) {
      // The sign-in route answers HTTP 500 for bad credentials, so its status carries no
      // information; the API's own message ("Invalid username or password") is the whole signal.
      return { ok: false, kind: 'auth', error: result.message, status: null }
    }
    // The integrations card caches its preflight result and would keep reporting "not connected".
    _resetPreflightCache()
    // A new account must not inherit the previous one's names or project memberships.
    resetAcNameDirectoryCache()
    resetAcProjectMembersCache()
    return { ok: true, value: result.connection }
  } catch (error) {
    return toFailure(error)
  }
}

export function acDisconnect(): Promise<ActiveCollabResult<ActiveCollabConnectionStatus>> {
  return guard(async () => {
    clearActiveCollabCredential()
    _resetPreflightCache()
    resetAcNameDirectoryCache()
    resetAcProjectMembersCache()
    return getActiveCollabConnectionStatus()
  })
}

export function acListAssignedTasks(
  args?: unknown
): Promise<ActiveCollabResult<ActiveCollabTaskPage>> {
  return guard(async () => {
    const page = pageNumber(record(args).page)
    const { http, userId, names } = acClient()
    // Started before the task read, not after: on a cold cache the two round trips overlap.
    const directory = names()
    const result = await listAssignedTasks({ http, userId, page })
    await acResolveTaskNames(directory, result.tasks)
    return result
  })
}

export function acListProjects(): Promise<ActiveCollabResult<ActiveCollabProject[]>> {
  return guard(async () => listProjects({ http: acClient().http }))
}

export function acGetTaskDetail(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabTaskDetail>> {
  return guard(async () => {
    const { projectId, taskId } = taskRef(args)
    const { http, names } = acClient()
    const directory = names()
    const detail = await getTaskDetail({ http, projectId, taskId })
    await acResolveTaskNames(directory, [detail.task])
    return detail
  })
}

export function acGetAttachmentImage(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabAttachmentImage>> {
  return guard(async () => {
    const attachmentId = positiveId(record(args).attachmentId, 'attachmentId')
    return getAttachmentImage({ http: acClient().http, attachmentId })
  })
}

export function acUpdateTask(args: unknown): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const { projectId, taskId } = taskRef(args)
    const update = taskUpdate(record(args).update)
    const { http, names } = acClient()
    const directory = names()
    // The echoed row is patched straight into the renderer's caches, so it has to arrive with the
    // same names the read path resolved — otherwise every edit blanks the heading it just fixed.
    const task = await updateTask({ http, projectId, taskId, update })
    await acResolveTaskNames(directory, [task])
    return task
  })
}

export function acCompleteTask(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const taskId = positiveId(record(args).taskId, 'taskId')
    const { http, names } = acClient()
    const directory = names()
    const task = await completeTask({ http, taskId })
    await acResolveTaskNames(directory, [task])
    return task
  })
}

export function acReopenTask(args: unknown): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const taskId = positiveId(record(args).taskId, 'taskId')
    const { http, names } = acClient()
    const directory = names()
    const task = await reopenTask({ http, taskId })
    await acResolveTaskNames(directory, [task])
    return task
  })
}

export function acPostComment(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabComment | null>> {
  return guard(async () => {
    const input = record(args)
    const taskId = positiveId(input.taskId, 'taskId')
    const bodyHtml = boundedText(input.bodyHtml, 'bodyHtml', MAX_BODY)
    if (bodyHtml.trim() === '') {
      throw new InvalidRequestError('bodyHtml is required.')
    }
    return postComment({ http: acClient().http, taskId, bodyHtml })
  })
}

export function acListLabels(): Promise<ActiveCollabResult<ActiveCollabLabel[]>> {
  return guard(async () => listLabels({ http: acClient().http }))
}

export function registerActiveCollabHandlers(): void {
  for (const channel of ACTIVECOLLAB_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('activecollab:status', async () => acStatus())
  ipcMain.handle('activecollab:connect', async (_event, args: unknown) => acConnect(args))
  ipcMain.handle('activecollab:disconnect', async () => acDisconnect())
  ipcMain.handle('activecollab:listAssignedTasks', async (_event, args?: unknown) =>
    acListAssignedTasks(args)
  )
  ipcMain.handle('activecollab:listProjects', async () => acListProjects())
  ipcMain.handle('activecollab:getTaskDetail', async (_event, args: unknown) =>
    acGetTaskDetail(args)
  )
  ipcMain.handle('activecollab:getAttachmentImage', async (_event, args: unknown) =>
    acGetAttachmentImage(args)
  )
  ipcMain.handle('activecollab:updateTask', async (_event, args: unknown) => acUpdateTask(args))
  ipcMain.handle('activecollab:completeTask', async (_event, args: unknown) => acCompleteTask(args))
  ipcMain.handle('activecollab:reopenTask', async (_event, args: unknown) => acReopenTask(args))
  ipcMain.handle('activecollab:postComment', async (_event, args: unknown) => acPostComment(args))
  ipcMain.handle('activecollab:listLabels', async () => acListLabels())
  ipcMain.handle('activecollab:listUsers', async () => acListUsers())
  ipcMain.handle('activecollab:listProjectMembers', async (_event, args: unknown) =>
    acListProjectMembers(args)
  )
}
