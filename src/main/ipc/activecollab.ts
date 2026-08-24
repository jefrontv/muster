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
//
// The change notifier's lifecycle hangs off this file: connect and disconnect are what start and
// stop its poll loop, and every write below folds its own echo into the notifier's snapshot so the
// next poll does not tell the user about their own edit — see ../activecollab/task-snapshot-store.ts.

import { ipcMain, powerMonitor } from 'electron'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type {
  ActiveCollabConnection,
  ActiveCollabConnectionStatus
} from '../../shared/activecollab-types'
import { connectActiveCollab } from '../activecollab/auth'
import { shareActiveCollabLoginWithMcp } from '../activecollab/mcp-install'
import {
  clearActiveCollabCredential,
  getActiveCollabConnectionStatus
} from '../activecollab/credential-store'
import { resetAcNameDirectoryCache } from '../activecollab/name-directory'
import { resetAcProjectMembersCache } from '../activecollab/project-members'
import {
  pollAcTaskNotificationsAfterResume,
  refreshAcTaskNotifications,
  startAcTaskNotifications
} from '../activecollab/task-notification-service'
import { acClearTaskSnapshot } from '../activecollab/task-snapshot-store'
import type { Store } from '../persistence'
import {
  boundedText,
  InvalidRequestError,
  MAX_EMAIL,
  MAX_SECRET,
  MAX_URL,
  record
} from './activecollab-argument-validation'
import { guard, toFailure } from './activecollab-operation-context'
export {
  acGetAttachmentImage,
  acGetTaskDetail,
  acListAssignedTasks,
  acListLabels,
  acListProjects,
  acListProjectTasks,
  acListUpdates
} from './activecollab-read-operations'
import {
  acGetAttachmentImage,
  acGetTaskDetail,
  acListAssignedTasks,
  acListLabels,
  acListProjects,
  acListProjectTasks,
  acListUpdates
} from './activecollab-read-operations'
export {
  acCompleteSubtask,
  acCompleteTask,
  acCreateSubtask,
  acCreateTask,
  acDeleteComment,
  acPostComment,
  acReopenSubtask,
  acReopenTask,
  acSetTaskSubscription,
  acUpdateComment,
  acUpdateSubtask,
  acUpdateTask
} from './activecollab-task-write-operations'
import {
  acCompleteSubtask,
  acCompleteTask,
  acCreateSubtask,
  acCreateTask,
  acDeleteComment,
  acPostComment,
  acReopenSubtask,
  acReopenTask,
  acSetTaskSubscription,
  acUpdateComment,
  acUpdateSubtask,
  acUpdateTask
} from './activecollab-task-write-operations'
import { acListProjectMembers, acListUsers } from './activecollab-people'
import { acDownloadAttachment } from './activecollab-attachment-download'
import { acMarkTaskRead, acTaskUnread } from './activecollab-unread'
import {
  acDescribeCommentAttachments,
  acPickCommentAttachments,
  acUploadCommentAttachments
} from './activecollab-comment-attachments'
import { _resetPreflightCache } from './preflight'

const ACTIVECOLLAB_CHANNELS = [
  'activecollab:status',
  'activecollab:connect',
  'activecollab:disconnect',
  'activecollab:listAssignedTasks',
  'activecollab:listProjects',
  'activecollab:listProjectTasks',
  'activecollab:getTaskDetail',
  'activecollab:getAttachmentImage',
  'activecollab:downloadAttachment',
  'activecollab:pickCommentAttachments',
  'activecollab:describeCommentAttachments',
  'activecollab:uploadCommentAttachments',
  'activecollab:createTask',
  'activecollab:updateTask',
  'activecollab:completeTask',
  'activecollab:reopenTask',
  'activecollab:postComment',
  'activecollab:createSubtask',
  'activecollab:updateSubtask',
  'activecollab:completeSubtask',
  'activecollab:reopenSubtask',
  'activecollab:updateComment',
  'activecollab:deleteComment',
  'activecollab:setTaskSubscription',
  'activecollab:listLabels',
  'activecollab:listUsers',
  'activecollab:listProjectMembers',
  'activecollab:listUpdates',
  'activecollab:unread',
  'activecollab:markTaskRead'
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
    // A different account may have different toggles, and the previous one's loop is now pointless.
    refreshAcTaskNotifications()
    // Same login the Tasks surface just accepted. First connect mints the MCP file and wires
    // Claude when the server binary is already installed; later reconnects overwrite the file
    // so the agent cannot stay on a previous account. Best-effort: a disk or keychain problem
    // here is not a sign-in failure.
    try {
      shareActiveCollabLoginWithMcp()
    } catch (error) {
      console.warn('[activecollab] could not share this login with the MCP:', error)
    }
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
    // The tasks of a credential the user just removed are not ours to keep, and nothing left to poll.
    acClearTaskSnapshot()
    refreshAcTaskNotifications()
    return getActiveCollabConnectionStatus()
  })
}

export function registerActiveCollabHandlers(store: Store): void {
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
  ipcMain.handle('activecollab:listProjectTasks', async (_event, args: unknown) =>
    acListProjectTasks(args)
  )
  ipcMain.handle('activecollab:getTaskDetail', async (_event, args: unknown) =>
    acGetTaskDetail(args)
  )
  ipcMain.handle('activecollab:getAttachmentImage', async (_event, args: unknown) =>
    acGetAttachmentImage(args)
  )
  // The two handlers that need their event: both dialogs are parented to the calling window.
  ipcMain.handle('activecollab:downloadAttachment', async (event, args: unknown) =>
    acDownloadAttachment(args, event.sender)
  )
  ipcMain.handle('activecollab:pickCommentAttachments', async (event) =>
    acPickCommentAttachments(event.sender)
  )
  ipcMain.handle('activecollab:describeCommentAttachments', async (_event, args: unknown) =>
    acDescribeCommentAttachments(args)
  )
  ipcMain.handle('activecollab:uploadCommentAttachments', async (_event, args: unknown) =>
    acUploadCommentAttachments(args)
  )
  ipcMain.handle('activecollab:createTask', async (_event, args: unknown) => acCreateTask(args))
  ipcMain.handle('activecollab:updateTask', async (_event, args: unknown) => acUpdateTask(args))
  ipcMain.handle('activecollab:completeTask', async (_event, args: unknown) => acCompleteTask(args))
  ipcMain.handle('activecollab:reopenTask', async (_event, args: unknown) => acReopenTask(args))
  ipcMain.handle('activecollab:postComment', async (_event, args: unknown) => acPostComment(args))
  ipcMain.handle('activecollab:createSubtask', async (_event, args: unknown) =>
    acCreateSubtask(args)
  )
  ipcMain.handle('activecollab:updateSubtask', async (_event, args: unknown) =>
    acUpdateSubtask(args)
  )
  ipcMain.handle('activecollab:completeSubtask', async (_event, args: unknown) =>
    acCompleteSubtask(args)
  )
  ipcMain.handle('activecollab:reopenSubtask', async (_event, args: unknown) =>
    acReopenSubtask(args)
  )
  ipcMain.handle('activecollab:updateComment', async (_event, args: unknown) =>
    acUpdateComment(args)
  )
  ipcMain.handle('activecollab:deleteComment', async (_event, args: unknown) =>
    acDeleteComment(args)
  )
  ipcMain.handle('activecollab:setTaskSubscription', async (_event, args: unknown) =>
    acSetTaskSubscription(args)
  )
  ipcMain.handle('activecollab:listLabels', async () => acListLabels())
  ipcMain.handle('activecollab:listUsers', async () => acListUsers())
  ipcMain.handle('activecollab:listProjectMembers', async (_event, args: unknown) =>
    acListProjectMembers(args)
  )
  ipcMain.handle('activecollab:listUpdates', async (_event, args?: unknown) => acListUpdates(args))
  ipcMain.handle('activecollab:unread', async () => acTaskUnread())
  ipcMain.handle('activecollab:markTaskRead', async (_event, args: unknown) => acMarkTaskRead(args))

  // Polls only while connected and something can surface the result; the service's refresh() decides
  // that, so registering is cheap for the vast majority who never connect ActiveCollab.
  startAcTaskNotifications({
    store,
    fetchPage: (page) => acListAssignedTasks({ page }),
    // Page one is enough: the stream is newest-first, and a mention older than 30 pending updates
    // is not news worth a banner.
    fetchUpdates: () => acListUpdates({ page: 1 })
  })
  // Wake catch-up: after sleep the pending poll timer may be most of an interval away, so
  // overnight changes would otherwise surface minutes late (same pattern as agent-awake-service).
  powerMonitor.on('resume', pollAcTaskNotificationsAfterResume)
}
