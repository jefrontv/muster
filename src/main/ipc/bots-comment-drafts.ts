// IPC for the Bots comment drafts panel: list, edit, discard, undo, ask the bot, and post.
import { BrowserWindow, ipcMain } from 'electron'
import type {
  BotsCommentDraftEdit,
  BotsCommentDraftPostArgs,
  BotsCommentDraftResult
} from '../../shared/bots-comment-draft-types'
import { createBotsDraftTaskLookup } from '../bots/bots-comment-draft-tasks'
import { postBotsCommentDraft } from '../bots/bots-comment-draft-post'
import { botsCommentDrafts, onBotsCommentDraftsChanged } from '../bots/bots-sidecar'
import { acClient } from './activecollab-operation-context'
import { acListProjects, acListProjectTasks } from './activecollab-read-operations'
import { acPostComment, acUpdateTask } from './activecollab-task-write-operations'

const CHANNELS = [
  'bots:listCommentDrafts',
  'bots:commentDraftTask',
  'bots:updateCommentDraft',
  'bots:discardCommentDraft',
  'bots:undoCommentDraft',
  'bots:commentDraftFeedback',
  'bots:postCommentDraft',
  'bots:reassignCommentDraftTask'
] as const

const MAX_ID = 200
const MAX_BODY = 200_000
const MAX_NOTE = 2_000

class InvalidDraftArgument extends Error {}

function draftId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > MAX_ID) {
    throw new InvalidDraftArgument('A draft id is required.')
  }
  return value
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.length > max) {
    throw new InvalidDraftArgument(`${name} must be text.`)
  }
  return value
}

function positiveInt(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new InvalidDraftArgument(`${name} must be a positive number.`)
  }
  return value
}

function editBody(value: unknown): Omit<BotsCommentDraftEdit, 'id'> {
  const input = (value ?? {}) as Record<string, unknown>
  return {
    bodyHtml: text(input.bodyHtml, 'bodyHtml', MAX_BODY),
    bodyText: text(input.bodyText, 'bodyText', MAX_BODY),
    baseVersion: positiveInt(input.baseVersion, 'baseVersion')
  }
}

// Bad renderer input answers as a result like every other failure instead of rejecting the invoke.
async function guarded<T>(
  call: () => Promise<BotsCommentDraftResult<T>>
): Promise<BotsCommentDraftResult<T>> {
  try {
    return await call()
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

const taskLookup = createBotsDraftTaskLookup({
  listProjects: acListProjects,
  listProjectTasks: acListProjectTasks,
  people: async () => {
    const { userId, names } = acClient()
    const directory = await names()
    return {
      selfId: userId,
      names: new Map([...directory.users].map(([id, user]) => [id, user.name]))
    }
  }
})

const reassignTask = ({
  projectId,
  taskId,
  assigneeId
}: {
  projectId: number
  taskId: number
  assigneeId: number
}) => acUpdateTask({ projectId, taskId, update: { assigneeId } })

let stopForwarding: (() => void) | null = null

export function registerBotsCommentDraftHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  ipcMain.handle('bots:listCommentDrafts', () => botsCommentDrafts.list('waiting'))
  ipcMain.handle('bots:commentDraftTask', (_event, ref: unknown) =>
    guarded(async () => {
      const input = (ref ?? {}) as Record<string, unknown>
      const value = await taskLookup.lookup({
        projectId: positiveInt(input.projectId, 'projectId'),
        taskId: positiveInt(input.taskId, 'taskId')
      })
      return { ok: true, value }
    })
  )
  ipcMain.handle('bots:updateCommentDraft', (_event, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      return botsCommentDrafts.update({ id: draftId(input.id), ...editBody(input) })
    })
  )
  ipcMain.handle('bots:discardCommentDraft', (_event, id: unknown) =>
    guarded(() => botsCommentDrafts.setStatus(draftId(id), 'discarded'))
  )
  ipcMain.handle('bots:undoCommentDraft', (_event, id: unknown) =>
    guarded(() => botsCommentDrafts.undo(draftId(id)))
  )
  ipcMain.handle('bots:commentDraftFeedback', (_event, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      const note = text(input.note, 'note', MAX_NOTE).trim()
      if (!note) {
        throw new InvalidDraftArgument('Write what to change first.')
      }
      return botsCommentDrafts.feedback(draftId(input.id), note)
    })
  )
  ipcMain.handle('bots:postCommentDraft', (_event, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      const post: BotsCommentDraftPostArgs = {
        id: draftId(input.id),
        edit: input.edit === undefined ? undefined : editBody(input.edit),
        reassignTo:
          input.reassignTo === undefined ? undefined : positiveInt(input.reassignTo, 'reassignTo')
      }
      return postBotsCommentDraft(botsCommentDrafts, acPostComment, post, undefined, reassignTask)
    })
  )
  ipcMain.handle('bots:reassignCommentDraftTask', (_event, args: unknown) =>
    guarded(async () => {
      const input = (args ?? {}) as Record<string, unknown>
      const moved = await reassignTask({
        projectId: positiveInt(input.projectId, 'projectId'),
        taskId: positiveInt(input.taskId, 'taskId'),
        assigneeId: positiveInt(input.assigneeId, 'assigneeId')
      })
      return moved.ok
        ? { ok: true as const, value: null }
        : { ok: false as const, reason: 'error' as const, message: moved.error }
    })
  )
  stopForwarding?.()
  stopForwarding = onBotsCommentDraftsChanged(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('bots:commentDraftsChanged')
      }
    }
  })
}
