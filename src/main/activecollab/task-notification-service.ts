// Production wiring for the ActiveCollab task notifier: settings in, notifications out.
//
// Everything policy-shaped lives elsewhere on purpose — the change rules in
// task-change-detector.ts, the cadence and the never-diff-a-bad-fetch rules in
// task-notification-poller.ts, the credential-keyed storage in task-snapshot-store.ts, the unread
// model in task-unread.ts. This module only knows which toggle means which change kind, what still
// makes a poll worth making, and how a change reads as a banner.
//
// The page fetch is INJECTED rather than imported: the operation that reads assigned tasks lives in
// ipc/activecollab.ts, which starts this service, so importing it back would be a cycle.

import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabTaskPage } from '../../shared/activecollab-types'
import type {
  GlobalSettings,
  NotificationDispatchRequest,
  NotificationEventSource,
  NotificationSettings
} from '../../shared/types'
import { dispatchMainProcessNotification } from '../ipc/notifications'
import { broadcastAcTaskUnread } from '../ipc/activecollab-unread'
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
  acLoadTaskUnread,
  acSaveTaskSnapshot,
  acSaveTaskUnread
} from './task-snapshot-store'

const AC_SOURCE_BY_KIND: Record<AcTaskChangeKind, NotificationEventSource> = {
  assigned: 'activecollab-assigned',
  comments: 'activecollab-comments',
  due: 'activecollab-due',
  updated: 'activecollab-updated'
}

/**
 * The kinds the user asked for a BANNER about. Empty is the DEFAULT case — all four ship off — and
 * empty no longer means "do not poll": the sidebar badge is fed by the same diff and is not gated on
 * these (see acShouldPollAcTasks). The master switch is read here too: off is off, whatever the
 * four say.
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
 * Whether a poll is worth making at all.
 *
 * The badge changed this from "any banner is switched on" to "anything can show the answer",
 * because the user asked for an unread count they can clear and gating it on the banner toggles
 * would make it a second notification rather than the quieter surface it is.
 *
 * Being straight about the cost: this means the realistic case for a connected user is a request
 * against their own work server every three minutes, where before it was only for those who opted
 * into banners. That is the load the cadence in task-notification-poller.ts was already sized for
 * at full adoption — about one request a second across the whole target instance — and connecting
 * ActiveCollab is itself the opt-in: nobody types their work credentials in to be shown nothing.
 *
 * The escape hatch survives, which is why this is not simply "connected". Every banner off AND the
 * Tasks button hidden leaves nowhere for a result to appear, and a poll nobody could observe is not
 * worth one request, let alone twenty an hour.
 */
export function acShouldPollAcTasks(settings: GlobalSettings): boolean {
  return acEnabledChangeKinds(settings.notifications).size > 0 || settings.showTasksButton !== false
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
      taskId: change.task.id,
      projectId: change.task.projectId,
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
    shouldPoll: () => acShouldPollAcTasks(store.getSettings()),
    intervalMs: () => store.getSettings().activeCollabPollIntervalMs,
    notifyKinds: () => acEnabledChangeKinds(store.getSettings().notifications),
    fetchPage,
    loadSnapshot: acLoadTaskSnapshot,
    saveSnapshot: acSaveTaskSnapshot,
    loadUnread: acLoadTaskUnread,
    saveUnread: acSaveTaskUnread,
    onUnread: broadcastAcTaskUnread,
    emit: (change) => {
      // A notification that could not be shown is not actionable, and must not take down the poll.
      void dispatchMainProcessNotification(acChangeNotification(change, Date.now())).catch(
        () => undefined
      )
    },
    onAuthFailure: () => {
      // The poller has already stopped itself; without this the outage is silent until the user
      // happens to open the Tasks page. One banner; reconnecting re-arms via refresh().
      void dispatchMainProcessNotification({
        source: 'activecollab-auth',
        dedupeKey: 'activecollab:auth',
        notificationId: 'activecollab:auth'
      }).catch(() => undefined)
    },
    emitSummary: (kind, count) => {
      void dispatchMainProcessNotification({
        source: AC_SOURCE_BY_KIND[kind],
        dedupeKey: `activecollab:summary:${kind}`,
        notificationId: `activecollab:summary:${kind}`,
        activeCollabSummary: { count }
      }).catch(() => undefined)
    },
    schedule: (delayMs, run) => {
      const timer = setTimeout(run, delayMs)
      return () => clearTimeout(timer)
    }
  })
  // Flipping a toggle, hiding the Tasks button or editing the cadence in Settings lands here.
  acSettingsSubscription = store.onSettingsChanged(() => acPoller?.refresh())
  acPoller.refresh()
}

/** Connect, disconnect and settings changes all land here: match the loop to the current world. */
export function refreshAcTaskNotifications(): void {
  acPoller?.refresh()
}

/** Settle delay before the post-resume catch-up poll: the network is rarely up the instant the
 *  lid opens, and an immediate poll would just burn the first backoff step. */
export const AC_RESUME_POLL_DELAY_MS = 5_000

/**
 * Wake catch-up: after sleep, the pending timer may sit most of an interval away (or fire into a
 * dead network), so a laptop opened in the morning would show overnight changes late. One direct
 * poll, off the timer loop; the `inFlight` latch makes overlap with the timer harmless.
 */
export function pollAcTaskNotificationsAfterResume(): void {
  setTimeout(() => {
    void acPoller?.poll().catch(() => undefined)
  }, AC_RESUME_POLL_DELAY_MS)
}

export function stopAcTaskNotifications(): void {
  acPoller?.stop()
  acPoller = null
  acSettingsSubscription?.()
  acSettingsSubscription = null
}
