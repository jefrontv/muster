// Production wiring for the ActiveCollab task notifier: settings in, notifications out.
//
// Everything policy-shaped lives elsewhere on purpose — the change rules in
// task-change-detector.ts, the cadence and the never-diff-a-bad-fetch rules in
// task-notification-poller.ts, the credential-keyed storage in task-snapshot-store.ts. This module
// only knows which toggle means which change kind, and how a change reads as a banner.
//
// The page fetch is INJECTED rather than imported: the operation that reads assigned tasks lives in
// ipc/activecollab.ts, which starts this service, so importing it back would be a cycle.

import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabTaskPage } from '../../shared/activecollab-types'
import type {
  NotificationDispatchRequest,
  NotificationEventSource,
  NotificationSettings
} from '../../shared/types'
import { dispatchMainProcessNotification } from '../ipc/notifications'
import type { Store } from '../persistence'
import type { AcTaskChange, AcTaskChangeKind } from './task-change-detector'
import {
  AC_DUE_NOTIFY_FLOOR,
  acDueBucketFor,
  acDueBucketPhrase,
  acDueBucketRank
} from './task-due-bucket'
import { createAcTaskPoller, type AcTaskPoller } from './task-notification-poller'
import {
  acCurrentTaskSnapshotKey,
  acLoadTaskSnapshot,
  acSaveTaskSnapshot
} from './task-snapshot-store'

const AC_SOURCE_BY_KIND: Record<AcTaskChangeKind, NotificationEventSource> = {
  assigned: 'activecollab-assigned',
  comments: 'activecollab-comments',
  due: 'activecollab-due',
  updated: 'activecollab-updated'
}

/**
 * The kinds the user asked to hear about. Empty is the DEFAULT case — all four ship off — and empty
 * means the poller never runs, so nobody's work server is polled on a hunch. The master switch is
 * read here too: off is off, whatever the four say.
 */
export function acEnabledChangeKinds(
  notifications: NotificationSettings
): ReadonlySet<AcTaskChangeKind> {
  const kinds = new Set<AcTaskChangeKind>()
  if (!notifications.enabled) {
    return kinds
  }
  if (notifications.activeCollabAssigned) {
    kinds.add('assigned')
  }
  if (notifications.activeCollabComments) {
    kinds.add('comments')
  }
  if (notifications.activeCollabDue) {
    kinds.add('due')
  }
  if (notifications.activeCollabUpdated) {
    kinds.add('updated')
  }
  return kinds
}

/**
 * One change as a dispatch request. The due phrase rides along on an assignment only when the date
 * is close enough to matter: "Assigned to you: X · Overdue" is one glance, while "· Due later" on
 * every new task is noise.
 */
export function acChangeNotification(
  change: AcTaskChange,
  now: number
): NotificationDispatchRequest {
  let duePhrase: string | undefined
  if (change.kind === 'due') {
    duePhrase = acDueBucketPhrase(change.bucket)
  } else if (change.kind === 'assigned') {
    const bucket = acDueBucketFor(change.task.dueOn, now)
    if (acDueBucketRank(bucket) >= acDueBucketRank(AC_DUE_NOTIFY_FLOOR)) {
      duePhrase = acDueBucketPhrase(bucket)
    }
  }
  // Per task AND per kind: one poll can legitimately return a comment and a due escalation on the
  // same task, and a single key would let the 5-second burst cooldown swallow the second.
  const key = `activecollab:${change.task.id}:${change.kind}`
  return {
    source: AC_SOURCE_BY_KIND[change.kind],
    dedupeKey: key,
    // Same id replaces the banner it supersedes: "2 new comments" should not sit under "1 new".
    notificationId: key,
    activeCollab: {
      taskName: change.task.name,
      projectName: change.task.projectName,
      ...(change.kind === 'comments' ? { newComments: change.newComments } : {}),
      ...(duePhrase === undefined ? {} : { duePhrase })
    }
  }
}

let acPoller: AcTaskPoller | null = null
let acSettingsSubscription: (() => void) | null = null

/**
 * Registers the notifier. Idempotent: re-registering replaces the previous timer and subscription
 * rather than running two loops against the same instance.
 */
export function startAcTaskNotifications(args: {
  store: Store
  fetchPage: (page: number) => Promise<ActiveCollabResult<ActiveCollabTaskPage>>
}): void {
  stopAcTaskNotifications()
  const { store, fetchPage } = args
  acPoller = createAcTaskPoller({
    now: Date.now,
    snapshotKey: acCurrentTaskSnapshotKey,
    enabledKinds: () => acEnabledChangeKinds(store.getSettings().notifications),
    fetchPage,
    loadSnapshot: acLoadTaskSnapshot,
    saveSnapshot: acSaveTaskSnapshot,
    emit: (change) => {
      // A notification that could not be shown is not actionable, and must not take down the poll.
      void dispatchMainProcessNotification(acChangeNotification(change, Date.now())).catch(
        () => undefined
      )
    },
    schedule: (delayMs, run) => {
      const timer = setTimeout(run, delayMs)
      return () => clearTimeout(timer)
    }
  })
  // Flipping a toggle in Settings is the only other thing that starts or stops the loop.
  acSettingsSubscription = store.onSettingsChanged(() => acPoller?.refresh())
  acPoller.refresh()
}

/** Connect, disconnect and settings changes all land here: match the loop to the current world. */
export function refreshAcTaskNotifications(): void {
  acPoller?.refresh()
}

export function stopAcTaskNotifications(): void {
  acPoller?.stop()
  acPoller = null
  acSettingsSubscription?.()
  acSettingsSubscription = null
}
