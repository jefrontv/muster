// Write transports for the ActiveCollab provider, split out of runtime-activecollab-client.ts so
// that file stays under its line budget. One entry per `ActiveCollabApi` write, dispatched through
// the shared `callActiveCollab` barrier in runtime-activecollab-transport.ts.

import type {
  ActiveCollabComment,
  ActiveCollabSubtask,
  ActiveCollabSubtaskUpdate,
  ActiveCollabTask,
  ActiveCollabTaskUpdate
} from '../../../shared/activecollab-types'
import type {
  ActiveCollabResult,
  ActiveCollabTaskRef
} from '../../../shared/activecollab-api-types'
import {
  OPERATION_TIMEOUT_MS,
  callActiveCollab,
  type RuntimeActiveCollabSettings
} from './runtime-activecollab-transport'

export async function activeCollabCreateTask(
  args: {
    projectId: number
    taskListId: number | null
    update: ActiveCollabTaskUpdate
    attachmentCodes?: string[]
  },
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

export async function activeCollabCreateSubtask(
  args: {
    projectId: number
    taskId: number
    name: string
    assigneeId?: number | null
    dueOn?: number | null
  },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return callActiveCollab('activecollab.createSubtask', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.createSubtask(args)
  )
}

export async function activeCollabUpdateSubtask(
  args: { projectId: number; taskId: number; subtaskId: number; update: ActiveCollabSubtaskUpdate },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return callActiveCollab('activecollab.updateSubtask', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.updateSubtask(args)
  )
}

export async function activeCollabCompleteSubtask(
  args: { subtaskId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return callActiveCollab(
    'activecollab.completeSubtask',
    args,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.completeSubtask(args)
  )
}

export async function activeCollabReopenSubtask(
  args: { subtaskId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return callActiveCollab('activecollab.reopenSubtask', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.reopenSubtask(args)
  )
}

export async function activeCollabUpdateComment(
  args: { commentId: number; bodyHtml: string },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<ActiveCollabComment | null>> {
  return callActiveCollab('activecollab.updateComment', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.updateComment(args)
  )
}

export async function activeCollabDeleteComment(
  args: { commentId: number },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<null>> {
  return callActiveCollab('activecollab.deleteComment', args, settings, OPERATION_TIMEOUT_MS, () =>
    window.api.activecollab.deleteComment(args)
  )
}

export async function activeCollabSetTaskSubscription(
  args: { taskId: number; userId: number; subscribed: boolean },
  settings?: RuntimeActiveCollabSettings
): Promise<ActiveCollabResult<null>> {
  return callActiveCollab(
    'activecollab.setTaskSubscription',
    args,
    settings,
    OPERATION_TIMEOUT_MS,
    () => window.api.activecollab.setTaskSubscription(args)
  )
}
