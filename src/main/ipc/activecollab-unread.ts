// The unread-count surface behind the sidebar Tasks badge: read the count, clear one task, and tell
// every window when it moves.
//
// LOCAL ONLY, with no runtime RPC twin, for the same reason the poll loop has none: the count is
// what THIS app's poller observed against the credential in THIS machine's keychain, so a remote
// host would answer about its own. Nothing here needs a token — the counts are a file — which is
// why it builds no AcHttpClient and a disconnected app answers an empty count rather than a
// failure. "You have nothing unread" is the truth while nothing is connected.
//
// MARK READ IS PER TASK, never per page. The user asked for a count that ceases when the items are
// read, and opening a list is not reading anything; clearing everything on the Tasks page would
// zero the badge for work nobody looked at.

import { BrowserWindow } from 'electron'
import type { ActiveCollabResult, ActiveCollabUnread } from '../../shared/activecollab-api-types'
import {
  acCurrentTaskSnapshotKey,
  acLoadTaskUnread,
  acSaveTaskUnread
} from '../activecollab/task-snapshot-store'
import {
  acForgetTaskUnread,
  acTaskUnreadSummary,
  type AcTaskUnread
} from '../activecollab/task-unread'
import { positiveId, record } from './activecollab-argument-validation'
import { guard } from './activecollab-operation-context'

const AC_NO_UNREAD: ActiveCollabUnread = { total: 0, byTask: {} }

/** Every window, because a popout carries the same sidebar and the same badge. */
export function broadcastAcTaskUnread(unread: AcTaskUnread): void {
  const summary = acTaskUnreadSummary(unread)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('activecollab:unreadChanged', summary)
    }
  }
}

export function acTaskUnread(): Promise<ActiveCollabResult<ActiveCollabUnread>> {
  return guard(async () => {
    const key = acCurrentTaskSnapshotKey()
    return key === null ? AC_NO_UNREAD : acTaskUnreadSummary(acLoadTaskUnread(key))
  })
}

/**
 * Clears one task, answering the counts that remain so the caller needs no follow-up read.
 *
 * Called on every task the detail pane opens, the vast majority of which have nothing unread, so
 * the no-change path writes nothing and wakes nobody.
 */
export function acMarkTaskRead(args: unknown): Promise<ActiveCollabResult<ActiveCollabUnread>> {
  return guard(async () => {
    const taskId = positiveId(record(args).taskId, 'taskId')
    const key = acCurrentTaskSnapshotKey()
    if (key === null) {
      return AC_NO_UNREAD
    }
    const unread = acLoadTaskUnread(key)
    const next = acForgetTaskUnread(unread, taskId)
    if (next !== unread) {
      acSaveTaskUnread(key, next)
      // The caller gets the answer below; this is for the windows that did not ask.
      broadcastAcTaskUnread(next)
    }
    return acTaskUnreadSummary(next)
  })
}
