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
  ActiveCollabTask
} from '../../shared/activecollab-types'
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import { AC_MAX_COMMENT_ATTACHMENTS } from '../activecollab/comment-attachment-upload'
import {
  completeTask,
  createTask,
  postComment,
  reopenTask,
  updateTask
} from '../activecollab/mutations'
import { acResolveTaskNames } from '../activecollab/name-directory'
import { acFoldLocalTaskWrite } from '../activecollab/task-snapshot-store'
import {
  boundedText,
  boundedTextList,
  InvalidRequestError,
  MAX_BODY,
  MAX_UPLOAD_CODE,
  positiveId,
  record,
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
    const { http, names } = acClient()
    const directory = names()
    const task = await createTask({ http, projectId, taskListId, fields })
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
