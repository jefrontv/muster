// The task-write operations behind `activecollab:createTask/updateTask/completeTask/reopenTask/
// postComment`. Split out of ipc/activecollab.ts purely for size; that module registers these on
// ipcMain and re-exports them for the runtime-RPC twin, so every caller still imports one surface.
//
// Two rules every write here follows:
//   - The echoed row is patched straight into the renderer's caches, so it must arrive with the
//     same names the read path resolved — hence acResolveTaskNames on every echo.
//   - Every write folds itself into the notification snapshot (acFoldLocalTaskWrite), so the poll
//     that observes the echo reports nothing back at the user about their own edit.

import type {
  ActiveCollabComment,
  ActiveCollabSubtask,
  ActiveCollabTask
} from '../../shared/activecollab-types'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import { AC_MAX_COMMENT_ATTACHMENTS } from '../activecollab/comment-attachment-upload'
import {
  completeTask,
  createTask,
  deleteComment,
  postComment,
  reopenTask,
  setTaskSubscription,
  updateComment,
  updateTask
} from '../activecollab/mutations'
import {
  completeSubtask,
  createSubtask,
  reopenSubtask,
  updateSubtask
} from '../activecollab/subtasks'
import { acResolveSubtaskNames, acResolveTaskNames } from '../activecollab/name-directory'
import { acFoldLocalTaskWrite } from '../activecollab/task-snapshot-store'
import {
  boundedText,
  boundedTextList,
  InvalidRequestError,
  MAX_BODY,
  MAX_NAME,
  MAX_UPLOAD_CODE,
  positiveId,
  record,
  subtaskUpdate,
  taskRef,
  taskUpdate
} from './activecollab-argument-validation'
import { acClient, guard } from './activecollab-operation-context'

export function acCreateTask(args: unknown): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const input = record(args)
    const projectId = positiveId(input.projectId, 'projectId')
    // Same field validation as an edit; only the name-required rule is create's own.
    const fields = taskUpdate(input.update)
    if ((fields.name ?? '').trim() === '') {
      throw new InvalidRequestError('update.name is required.')
    }
    const taskListId =
      input.taskListId === undefined || input.taskListId === null
        ? null
        : positiveId(input.taskListId, 'taskListId')
    // Same bounds as a comment's codes — they come from the same upload route.
    const attachmentCodes =
      input.attachmentCodes === undefined
        ? []
        : boundedTextList(
            input.attachmentCodes,
            'attachmentCodes',
            AC_MAX_COMMENT_ATTACHMENTS,
            MAX_UPLOAD_CODE
          )
    const { http, names } = acClient()
    const directory = names()
    const task = await createTask({ http, projectId, taskListId, fields, attachmentCodes })
    await acResolveTaskNames(directory, [task])
    // Own write: should the creator also be the assignee on this instance, the next poll must
    // not announce the user's own new task back at them.
    if (task) {
      acFoldLocalTaskWrite({ taskId: task.id, task })
    }
    return task
  })
}

export function acUpdateTask(args: unknown): Promise<ActiveCollabResult<ActiveCollabTask | null>> {
  return guard(async () => {
    const { projectId, taskId } = taskRef(args)
    const update = taskUpdate(record(args).update)
    const { http, names } = acClient()
    const directory = names()
    const task = await updateTask({ http, projectId, taskId, update })
    await acResolveTaskNames(directory, [task])
    acFoldLocalTaskWrite({ taskId, task, dueOn: update.dueOn })
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
    acFoldLocalTaskWrite({ taskId, task })
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
    acFoldLocalTaskWrite({ taskId, task })
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
    // Absent stays absent: postComment omits `attach_uploaded_files` entirely for an empty list,
    // so a plain comment posts exactly the body it always did.
    const attachmentCodes =
      input.attachmentCodes === undefined
        ? []
        : boundedTextList(
            input.attachmentCodes,
            'attachmentCodes',
            AC_MAX_COMMENT_ATTACHMENTS,
            MAX_UPLOAD_CODE
          )
    const comment = await postComment({
      http: acClient().http,
      taskId,
      bodyHtml,
      attachmentCodes
    })
    // The posted comment carries no task row, so the count this app just added is folded by hand.
    acFoldLocalTaskWrite({ taskId, postedComments: 1 })
    return comment
  })
}

export function acCreateSubtask(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return guard(async () => {
    const input = record(args)
    const projectId = positiveId(input.projectId, 'projectId')
    const taskId = positiveId(input.taskId, 'taskId')
    const name = boundedText(input.name, 'name', MAX_NAME)
    if (name.trim() === '') {
      throw new InvalidRequestError('name is required.')
    }
    // Optional nullable fields: omitted stays omitted, null stays null, a number must be usable.
    let assigneeId: number | null | undefined
    if (input.assigneeId === undefined || input.assigneeId === null) {
      assigneeId = input.assigneeId === null ? null : undefined
    } else {
      assigneeId = positiveId(input.assigneeId, 'assigneeId')
    }
    let dueOn: number | null | undefined
    if (input.dueOn === undefined || input.dueOn === null) {
      dueOn = input.dueOn === null ? null : undefined
    } else if (typeof input.dueOn !== 'number' || !Number.isFinite(input.dueOn)) {
      throw new InvalidRequestError('dueOn must be epoch milliseconds or null.')
    } else {
      dueOn = input.dueOn
    }
    const { http, names } = acClient()
    const directory = names()
    const subtask = await createSubtask({ http, projectId, taskId, name, assigneeId, dueOn })
    await acResolveSubtaskNames(directory, [subtask])
    // A subtask write echoes a subtask, never the task row; the task's `updated_on` still moves,
    // so marking it unknown suppresses the next poll's "updated" event.
    acFoldLocalTaskWrite({ taskId, task: null })
    return subtask
  })
}

export function acUpdateSubtask(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return guard(async () => {
    const input = record(args)
    const projectId = positiveId(input.projectId, 'projectId')
    const taskId = positiveId(input.taskId, 'taskId')
    const subtaskId = positiveId(input.subtaskId, 'subtaskId')
    const update = subtaskUpdate(input.update)
    const { http, names } = acClient()
    const directory = names()
    const subtask = await updateSubtask({ http, projectId, taskId, subtaskId, update })
    await acResolveSubtaskNames(directory, [subtask])
    acFoldLocalTaskWrite({ taskId, task: null })
    return subtask
  })
}

export function acCompleteSubtask(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return guard(async () => {
    const subtaskId = positiveId(record(args).subtaskId, 'subtaskId')
    const { http, names } = acClient()
    const directory = names()
    const subtask = await completeSubtask({ http, subtaskId })
    await acResolveSubtaskNames(directory, [subtask])
    // Project-scopeless: the task id lives on the echoed subtask, not in the call's own args.
    if (subtask) {
      acFoldLocalTaskWrite({ taskId: subtask.taskId, task: null })
    }
    return subtask
  })
}

export function acReopenSubtask(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabSubtask | null>> {
  return guard(async () => {
    const subtaskId = positiveId(record(args).subtaskId, 'subtaskId')
    const { http, names } = acClient()
    const directory = names()
    const subtask = await reopenSubtask({ http, subtaskId })
    await acResolveSubtaskNames(directory, [subtask])
    if (subtask) {
      acFoldLocalTaskWrite({ taskId: subtask.taskId, task: null })
    }
    return subtask
  })
}

export function acUpdateComment(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabComment | null>> {
  return guard(async () => {
    const input = record(args)
    const commentId = positiveId(input.commentId, 'commentId')
    const bodyHtml = boundedText(input.bodyHtml, 'bodyHtml', MAX_BODY)
    if (bodyHtml.trim() === '') {
      throw new InvalidRequestError('bodyHtml is required.')
    }
    return updateComment({ http: acClient().http, commentId, bodyHtml })
  })
}

export function acDeleteComment(args: unknown): Promise<ActiveCollabResult<null>> {
  return guard(async () => {
    const commentId = positiveId(record(args).commentId, 'commentId')
    return deleteComment({ http: acClient().http, commentId })
  })
}

export function acSetTaskSubscription(args: unknown): Promise<ActiveCollabResult<null>> {
  return guard(async () => {
    const input = record(args)
    const taskId = positiveId(input.taskId, 'taskId')
    const userId = positiveId(input.userId, 'userId')
    if (typeof input.subscribed !== 'boolean') {
      throw new InvalidRequestError('subscribed must be a boolean.')
    }
    return setTaskSubscription({
      http: acClient().http,
      taskId,
      userId,
      subscribed: input.subscribed
    })
  })
}
