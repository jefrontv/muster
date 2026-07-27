// Runtime RPC surface for the ActiveCollab provider — the remote-host twin of the ipcMain
// channels in src/main/ipc/activecollab.ts, one method per operation under the same names.
//
// The schemas here police SHAPE only. Bounds, clamping and the credential lookup live in the
// shared `ac*` operations the runtime forwards to, so a CLI caller and a renderer caller hit
// exactly the same rules rather than two drifting copies.

import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import {
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  requiredNumber,
  requiredString
} from '../schemas'

const Connect = z.object({
  instanceUrl: requiredString('Instance URL is required'),
  email: requiredString('Email is required'),
  password: requiredString('Password is required')
})

const AssignedTasks = z
  .object({
    page: OptionalFiniteNumber
  })
  .optional()

const TaskRef = z.object({
  projectId: requiredNumber('Project id is required'),
  taskId: requiredNumber('Task id is required')
})

const TaskId = z.object({
  taskId: requiredNumber('Task id is required')
})

const AttachmentRef = z.object({
  attachmentId: requiredNumber('Attachment id is required')
})

const TaskUpdate = z.object({
  projectId: requiredNumber('Project id is required'),
  taskId: requiredNumber('Task id is required'),
  update: z.object({
    name: OptionalString,
    // Plain, not OptionalString: an empty body is a legitimate "clear the description".
    bodyHtml: OptionalPlainString,
    assigneeId: z.union([z.number(), z.null()]).optional(),
    dueOn: z.union([z.number(), z.null()]).optional(),
    // Full replacement set — the API overwrites a task's labels rather than merging.
    labelNames: z.array(z.string()).optional()
  })
})

const Comment = z.object({
  taskId: requiredNumber('Task id is required'),
  bodyHtml: requiredString('Comment body is required')
})

export const ACTIVECOLLAB_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'activecollab.status',
    params: null,
    handler: async (_params, { runtime }) => runtime.activeCollabStatus()
  }),
  defineMethod({
    name: 'activecollab.connect',
    params: Connect,
    handler: async (params, { runtime }) => runtime.activeCollabConnect(params)
  }),
  defineMethod({
    name: 'activecollab.disconnect',
    params: null,
    handler: async (_params, { runtime }) => runtime.activeCollabDisconnect()
  }),
  defineMethod({
    name: 'activecollab.listAssignedTasks',
    params: AssignedTasks,
    handler: async (params, { runtime }) => runtime.activeCollabListAssignedTasks(params)
  }),
  defineMethod({
    name: 'activecollab.listProjects',
    params: null,
    handler: async (_params, { runtime }) => runtime.activeCollabListProjects()
  }),
  defineMethod({
    name: 'activecollab.getTaskDetail',
    params: TaskRef,
    handler: async (params, { runtime }) => runtime.activeCollabGetTaskDetail(params)
  }),
  defineMethod({
    name: 'activecollab.getAttachmentImage',
    params: AttachmentRef,
    handler: async (params, { runtime }) => runtime.activeCollabGetAttachmentImage(params)
  }),
  defineMethod({
    name: 'activecollab.updateTask',
    params: TaskUpdate,
    handler: async (params, { runtime }) => runtime.activeCollabUpdateTask(params)
  }),
  defineMethod({
    name: 'activecollab.completeTask',
    params: TaskId,
    handler: async (params, { runtime }) => runtime.activeCollabCompleteTask(params)
  }),
  defineMethod({
    name: 'activecollab.reopenTask',
    params: TaskId,
    handler: async (params, { runtime }) => runtime.activeCollabReopenTask(params)
  }),
  defineMethod({
    name: 'activecollab.postComment',
    params: Comment,
    handler: async (params, { runtime }) => runtime.activeCollabPostComment(params)
  }),
  defineMethod({
    name: 'activecollab.listLabels',
    params: null,
    handler: async (_params, { runtime }) => runtime.activeCollabListLabels()
  })
]
