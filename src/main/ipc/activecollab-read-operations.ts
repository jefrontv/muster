// The read half of the ActiveCollab provider surface, split out of activecollab.ts to keep that
// file under the line gate — same reason and same shape as activecollab-task-write-operations.ts.
//
// Every operation here validates untrusted arguments, builds an AcHttpClient from the stored
// credential via `acClient()`, and answers a tagged result. Nothing throws: `guard` turns a
// malformed argument, a missing credential and a rejected token into results the renderer branches
// on. The name-directory joins live here too, because the wire omits assignee and author names on
// every row this instance serves.

import type {
  ActiveCollabAttachmentImage,
  ActiveCollabResult
} from '../../shared/activecollab-api-types'
import type {
  ActiveCollabLabel,
  ActiveCollabProject,
  ActiveCollabProjectTasks,
  ActiveCollabTaskDetail,
  ActiveCollabTaskPage,
  ActiveCollabUpdates
} from '../../shared/activecollab-types'
import { getAttachmentImage } from '../activecollab/attachment-image'
import { listLabels } from '../activecollab/mutations'
import { acResolveSubtaskNames, acResolveTaskNames } from '../activecollab/name-directory'
import { listObjectUpdates } from '../activecollab/notifications'
import {
  getTaskDetail,
  listAssignedTasks,
  listProjects,
  listProjectTasks
} from '../activecollab/tasks'
import { pageNumber, positiveId, record, taskRef } from './activecollab-argument-validation'
import { acClient, guard } from './activecollab-operation-context'

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

export function acListProjectTasks(
  args: unknown
): Promise<ActiveCollabResult<ActiveCollabProjectTasks>> {
  return guard(async () => {
    const projectId = positiveId(record(args).projectId, 'projectId')
    const { http, names } = acClient()
    // Started before the task read, not after: on a cold cache the two round trips overlap.
    const directory = names()
    const result = await listProjectTasks({ http, projectId })
    await acResolveTaskNames(directory, result.tasks)
    return result
  })
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
    await acResolveSubtaskNames(directory, detail.subtasks)
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

export function acListLabels(): Promise<ActiveCollabResult<ActiveCollabLabel[]>> {
  return guard(async () => listLabels({ http: acClient().http }))
}

export function acListUpdates(args?: unknown): Promise<ActiveCollabResult<ActiveCollabUpdates>> {
  return guard(async () => {
    const page = pageNumber(record(args).page)
    return listObjectUpdates({ http: acClient().http, page })
  })
}
