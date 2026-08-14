// Runtime RPC surface for the ActiveCollab provider — the remote-host twin of the ipcMain
// channels in src/main/ipc/activecollab.ts, one method per operation under the same names.
//
// The schemas here police SHAPE only. Bounds, clamping and the credential lookup live in the
// shared `ac*` operations the runtime forwards to, so a CLI caller and a renderer caller hit
// exactly the same rules rather than two drifting copies.

import { z } from 'zod'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { acFoldLocalTaskWrite } from '../../../activecollab/task-snapshot-store'
import { defineMethod, type RpcMethod } from '../core'
import {
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  requiredNumber,
  requiredString
} from '../schemas'

/**
 * Fold a write routed to a REMOTE host into the LOCAL snapshot too. The remote host folds into
 * its own machine's snapshot, but the poller on THIS machine polls the local credential — when
 * both hold the same account (the team's common case), skipping this makes the local poller
 * announce the user's own edit as news. A task the local snapshot has never seen folds as a
 * no-op unless the server echoed a row; the next poll's grace-and-drop quietly retires that.
 */
function foldRemoteWriteLocally(
  result: unknown,
  args: { taskId: number; task?: ActiveCollabTask | null; postedComments?: number; dueOn?: number | null }
): void {
  const tagged = result as { ok?: boolean }
  if (tagged?.ok !== true) {
    return
  }
  try {
    acFoldLocalTaskWrite(args)
  } catch {
    // Folding is echo suppression, never the write itself: a disk fault here must not fail the RPC.
  }
}

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

const ProjectTasks = z.object({
  projectId: requiredNumber('Project id is required')
})

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

const ProjectRef = z.object({
  projectId: requiredNumber('Project id is required')
})

const TaskFields = z.object({
  name: OptionalString,
  // Plain, not OptionalString: an empty body is a legitimate "clear the description".
  bodyHtml: OptionalPlainString,
  assigneeId: z.union([z.number(), z.null()]).optional(),
  startOn: z.union([z.number(), z.null()]).optional(),
  dueOn: z.union([z.number(), z.null()]).optional(),
  // Full replacement set — the API overwrites a task's labels rather than merging.
  labelNames: z.array(z.string()).optional()
})

const TaskCreate = z.object({
  projectId: requiredNumber('Project id is required'),
  taskListId: z.union([z.number(), z.null()]),
  // name-required is enforced by the shared operation, so CLI and renderer hit one rule.
  update: TaskFields
})

const TaskUpdate = z.object({
  projectId: requiredNumber('Project id is required'),
  taskId: requiredNumber('Task id is required'),
  update: TaskFields
})

// No upload method twin: `activecollab:uploadCommentAttachments` reads paths off the disk of the
// machine the user is looking at, so a remote host would read its own. Codes minted locally still
// travel, because a code is just a string the instance already holds.
const Comment = z.object({
  taskId: requiredNumber('Task id is required'),
  bodyHtml: requiredString('Comment body is required'),
  attachmentCodes: z.array(z.string()).optional()
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
    name: 'activecollab.listProjectTasks',
    params: ProjectTasks,
    handler: async (params, { runtime }) => runtime.activeCollabListProjectTasks(params)
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
    name: 'activecollab.createTask',
    params: TaskCreate,
    handler: async (params, { runtime }) => {
      const result = await runtime.activeCollabCreateTask(params)
      const echoed = (result as { value?: ActiveCollabTask | null }).value ?? undefined
      if (echoed) {
        foldRemoteWriteLocally(result, { taskId: echoed.id, task: echoed })
      }
      return result
    }
  }),
  defineMethod({
    name: 'activecollab.updateTask',
    params: TaskUpdate,
    handler: async (params, { runtime }) => {
      const result = await runtime.activeCollabUpdateTask(params)
      foldRemoteWriteLocally(result, {
        taskId: params.taskId,
        task: (result as { value?: ActiveCollabTask | null }).value ?? undefined,
        ...(params.update.dueOn !== undefined ? { dueOn: params.update.dueOn } : {})
      })
      return result
    }
  }),
  defineMethod({
    name: 'activecollab.completeTask',
    params: TaskId,
    handler: async (params, { runtime }) => {
      const result = await runtime.activeCollabCompleteTask(params)
      foldRemoteWriteLocally(result, {
        taskId: params.taskId,
        task: (result as { value?: ActiveCollabTask | null }).value ?? undefined
      })
      return result
    }
  }),
  defineMethod({
    name: 'activecollab.reopenTask',
    params: TaskId,
    handler: async (params, { runtime }) => {
      const result = await runtime.activeCollabReopenTask(params)
      foldRemoteWriteLocally(result, {
        taskId: params.taskId,
        task: (result as { value?: ActiveCollabTask | null }).value ?? undefined
      })
      return result
    }
  }),
  defineMethod({
    name: 'activecollab.postComment',
    params: Comment,
    handler: async (params, { runtime }) => {
      const result = await runtime.activeCollabPostComment(params)
      // A comment result echoes the comment, never a task row: fold the count only.
      foldRemoteWriteLocally(result, { taskId: params.taskId, postedComments: 1 })
      return result
    }
  }),
  defineMethod({
    name: 'activecollab.listLabels',
    params: null,
    handler: async (_params, { runtime }) => runtime.activeCollabListLabels()
  }),
  defineMethod({
    name: 'activecollab.listUsers',
    params: null,
    handler: async (_params, { runtime }) => runtime.activeCollabListUsers()
  }),
  defineMethod({
    name: 'activecollab.listProjectMembers',
    params: ProjectRef,
    handler: async (params, { runtime }) => runtime.activeCollabListProjectMembers(params)
  })
]
