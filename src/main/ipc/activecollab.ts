// IPC for the ActiveCollab task provider, and the operation layer both transports share.
//
// The exported `ac*` functions are the whole provider surface: each validates untrusted arguments,
// builds an AcHttpClient from the stored credential, and answers a tagged result. The ipcMain
// handlers (local window) and OrcaRuntimeService (remote host, over runtime RPC) both call them,
// so the boundary rules are written once instead of once per transport.
//
// Nothing here throws. A malformed argument, a missing credential and a rejected token are all
// results the renderer branches on — an unhandled rejection crossing the bridge loses the reason
// the UI needs to pick between "reconnect", "fix your input", and "the server is unwell".
//
// No siteId appears anywhere: one ActiveCollab token addresses exactly one instance.

import { ipcMain } from 'electron'
import type {
  ActiveCollabFailure,
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../shared/activecollab-api-types'
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
} from '../../shared/activecollab-types'
import { connectActiveCollab } from '../activecollab/auth'
import { acIsRecord } from '../activecollab/codecs'
import {
  clearActiveCollabCredential,
  getActiveCollabConnectionStatus,
  getActiveCollabCredential,
  type ActiveCollabCredentialRecord
} from '../activecollab/credential-store'
import { ActiveCollabApiError, createAcHttp, type AcHttpClient } from '../activecollab/http'
import {
  completeTask,
  listLabels,
  postComment,
  reopenTask,
  updateTask
} from '../activecollab/mutations'
import { getTaskDetail, listAssignedTasks, listProjects } from '../activecollab/tasks'
import { _resetPreflightCache } from './preflight'

const ACTIVECOLLAB_CHANNELS = [
  'activecollab:status',
  'activecollab:connect',
  'activecollab:disconnect',
  'activecollab:listAssignedTasks',
  'activecollab:listProjects',
  'activecollab:getTaskDetail',
  'activecollab:updateTask',
  'activecollab:completeTask',
  'activecollab:reopenTask',
  'activecollab:postComment',
  'activecollab:listLabels'
] as const

// ActiveCollab's own columns are far shorter than any of these. The bounds exist so a hostile or
// wedged renderer cannot stream megabytes into a request body or the credential file.
const MAX_URL = 2_048
const MAX_EMAIL = 320
const MAX_SECRET = 1_024
const MAX_NAME = 512
const MAX_BODY = 65_536
const MAX_LABEL_NAME = 128
const MAX_LABELS = 64

/** A malformed call, rejected before the credential is read or any request is built. */
class InvalidRequestError extends Error {}

/** Nothing usable is stored, so there is no instance to address. */
class NotConfiguredError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return acIsRecord(value) ? value : {}
}

function positiveId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new InvalidRequestError(`${field} must be a positive integer.`)
  }
  return value
}

function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new InvalidRequestError(`${field} must be a string.`)
  }
  if (value.length > max) {
    throw new InvalidRequestError(`${field} exceeds ${max} characters.`)
  }
  return value
}

/** Clamped rather than rejected: a stale list asking for page 0 should read page 1, not fail. */
function pageNumber(value: unknown): number {
  if (value === undefined || value === null) {
    return 1
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidRequestError('page must be a finite number.')
  }
  return Math.max(1, Math.trunc(value))
}

function taskRef(args: unknown): ActiveCollabTaskRef {
  const input = record(args)
  return {
    projectId: positiveId(input.projectId, 'projectId'),
    taskId: positiveId(input.taskId, 'taskId')
  }
}

function labelNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new InvalidRequestError('update.labelNames must be an array of label names.')
  }
  if (value.length > MAX_LABELS) {
    throw new InvalidRequestError(`update.labelNames exceeds ${MAX_LABELS} entries.`)
  }
  return value.map((entry) => boundedText(entry, 'update.labelNames entry', MAX_LABEL_NAME))
}

/**
 * Rebuilt key by key rather than passed through. An omitted key has to stay omitted — ActiveCollab
 * reads absent as "leave alone" and null as "clear" — and spreading untrusted JSON would smuggle
 * unvalidated fields straight into the PUT body.
 */
function taskUpdate(value: unknown): ActiveCollabTaskUpdate {
  const input = record(value)
  const update: ActiveCollabTaskUpdate = {}
  if (input.name !== undefined) {
    update.name = boundedText(input.name, 'update.name', MAX_NAME)
  }
  if (input.bodyHtml !== undefined) {
    update.bodyHtml = boundedText(input.bodyHtml, 'update.bodyHtml', MAX_BODY)
  }
  if (input.assigneeId !== undefined) {
    update.assigneeId =
      input.assigneeId === null ? null : positiveId(input.assigneeId, 'update.assigneeId')
  }
  if (input.dueOn !== undefined) {
    if (
      input.dueOn !== null &&
      (typeof input.dueOn !== 'number' || !Number.isFinite(input.dueOn))
    ) {
      throw new InvalidRequestError('update.dueOn must be epoch milliseconds or null.')
    }
    update.dueOn = input.dueOn
  }
  if (input.labelNames !== undefined) {
    update.labelNames = labelNames(input.labelNames)
  }
  if (Object.keys(update).length === 0) {
    throw new InvalidRequestError('update requires at least one field.')
  }
  return update
}

function toFailure(error: unknown): ActiveCollabFailure {
  if (error instanceof ActiveCollabApiError) {
    // A rejected token means reconnect; anything else is the instance misbehaving and is worth
    // retrying. Collapsing the two would put a reconnect prompt in front of a 503.
    return {
      ok: false,
      kind: error.isAuthError ? 'auth' : 'api',
      error: error.message,
      status: error.status
    }
  }
  if (error instanceof NotConfiguredError) {
    return { ok: false, kind: 'not-configured', error: error.message, status: null }
  }
  if (error instanceof InvalidRequestError) {
    return { ok: false, kind: 'invalid-request', error: error.message, status: null }
  }
  return {
    ok: false,
    kind: 'unknown',
    error: error instanceof Error ? error.message : String(error),
    status: null
  }
}

async function guard<T>(call: () => Promise<T>): Promise<ActiveCollabResult<T>> {
  try {
    return { ok: true, value: await call() }
  } catch (error) {
    return toFailure(error)
  }
}

type AcContext = { http: AcHttpClient; userId: number }

/**
 * Built per call, never cached: a reconnect can replace the credential at any moment, and a cached
 * client would keep addressing the previous instance with the previous token.
 */
function acClient(): AcContext {
  let credential: ActiveCollabCredentialRecord | null = null
  try {
    credential = getActiveCollabCredential()
  } catch {
    // A keychain refusal and an absent file are the same story to the user — reconnect — and
    // getActiveCollabConnectionStatus() already phrases which of the two happened.
    credential = null
  }
  if (credential === null) {
    throw new NotConfiguredError(getActiveCollabConnectionStatus().reason)
  }
  return {
    http: createAcHttp({ baseUrl: credential.instanceUrl, token: credential.token }),
    userId: credential.userId
  }
}

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
    return { ok: true, value: result.connection }
  } catch (error) {
    return toFailure(error)
  }
}

export function acDisconnect(): Promise<ActiveCollabResult<ActiveCollabConnectionStatus>> {
  return guard(async () => {
    clearActiveCollabCredential()
    _resetPreflightCache()
    return getActiveCollabConnectionStatus()
  })
}

export function acListAssignedTasks(
  args?: unknown
): Promise<ActiveCollabResult<ActiveCollabTaskPage>> {
  return guard(async () => {
    const page = pageNumber(record(args).page)
    const { http, userId } = acClient()
    return listAssignedTasks({ http, userId, page })
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
    return getTaskDetail({ http: acClient().http, projectId, taskId })
  })
}

export function acUpdateTask(args: unknown): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const { projectId, taskId } = taskRef(args)
    const update = taskUpdate(record(args).update)
    return updateTask({ http: acClient().http, projectId, taskId, update })
  })
}

export function acCompleteTask(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const taskId = positiveId(record(args).taskId, 'taskId')
    return completeTask({ http: acClient().http, taskId })
  })
}

export function acReopenTask(args: unknown): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const taskId = positiveId(record(args).taskId, 'taskId')
    return reopenTask({ http: acClient().http, taskId })
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
  ipcMain.handle('activecollab:updateTask', async (_event, args: unknown) => acUpdateTask(args))
  ipcMain.handle('activecollab:completeTask', async (_event, args: unknown) => acCompleteTask(args))
  ipcMain.handle('activecollab:reopenTask', async (_event, args: unknown) => acReopenTask(args))
  ipcMain.handle('activecollab:postComment', async (_event, args: unknown) => acPostComment(args))
  ipcMain.handle('activecollab:listLabels', async () => acListLabels())
}
