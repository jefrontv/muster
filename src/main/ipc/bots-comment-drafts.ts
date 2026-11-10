// IPC for the Bots comment drafts panel: list, edit, discard, undo, ask the bot, and post.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import type {
  BotsCommentDraftEdit,
  BotsCommentDraftPostArgs,
  BotsCommentDraftResult
} from '../../shared/bots-comment-draft-types'
import { createBotsDraftTaskLookup } from '../bots/bots-comment-draft-tasks'
import { postBotsCommentDraft, type UploadAttachments } from '../bots/bots-comment-draft-post'
import { uploadAcCommentAttachments } from '../activecollab/comment-attachment-upload'
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
  'bots:reassignCommentDraftTask',
  'bots:addCommentDraftAttachments',
  'bots:addCommentDraftImage',
  'bots:removeCommentDraftAttachment',
  'bots:commentDraftAttachmentPreview'
] as const

const MAX_ID = 200
const MAX_BODY = 200_000
const MAX_NOTE = 2_000
const MAX_PATHS = 20
const MAX_PATH = 4_096
const MAX_NAME = 255
// Pasted images arrive as base64 from the renderer.
const MAX_PASTE_BASE64 = Math.ceil((64 * 1024 * 1024 * 4) / 3)
// Thumbnails and the large view only; bigger images show as a file chip.
const MAX_PREVIEW_BYTES = 16 * 1024 * 1024

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

function pathList(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_PATHS ||
    !value.every((path) => typeof path === 'string' && path && path.length <= MAX_PATH)
  ) {
    throw new InvalidDraftArgument(`Pick between 1 and ${MAX_PATHS} files.`)
  }
  return value as string[]
}

function fileName(value: unknown): string {
  const name = basename(text(value, 'name', MAX_NAME)).trim()
  if (!name || name === '.' || name === '..') {
    throw new InvalidDraftArgument('The file needs a name.')
  }
  return name
}

// Each file gets its own folder so two files with one name both keep it on the ActiveCollab side.
const uploadDraftAttachments: UploadAttachments = async (draft) => {
  const folder = await mkdtemp(join(tmpdir(), 'muster-draft-files-'))
  try {
    const paths: string[] = []
    for (const [index, file] of draft.attachments.entries()) {
      const bytes = await botsCommentDrafts.attachmentBytes(draft.id, file.id)
      if (!bytes.ok) {
        return {
          ok: false,
          message: `${file.name} couldn't be read: ${'message' in bytes ? bytes.message : bytes.reason}`
        }
      }
      const dir = join(folder, String(index))
      await mkdir(dir)
      const path = join(dir, basename(file.name) || `file-${index}`)
      await writeFile(path, bytes.value)
      paths.push(path)
    }
    const uploaded = await uploadAcCommentAttachments({ http: acClient().http, paths })
    return { ok: true, codes: uploaded.map((file) => file.code) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

async function addPastedImage(id: string, name: string, base64: string) {
  const folder = await mkdtemp(join(tmpdir(), 'muster-draft-paste-'))
  try {
    const path = join(folder, name)
    await writeFile(path, Buffer.from(base64, 'base64'))
    // The bots server copies the file in, so the temp copy can go straight after.
    return await botsCommentDrafts.addAttachments(id, [path])
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

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
      return postBotsCommentDraft(
        botsCommentDrafts,
        acPostComment,
        post,
        undefined,
        reassignTask,
        uploadDraftAttachments
      )
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
  ipcMain.handle('bots:addCommentDraftAttachments', (_event, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      return botsCommentDrafts.addAttachments(draftId(input.id), pathList(input.paths))
    })
  )
  ipcMain.handle('bots:addCommentDraftImage', (_event, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      return addPastedImage(
        draftId(input.id),
        fileName(input.name),
        text(input.dataBase64, 'dataBase64', MAX_PASTE_BASE64)
      )
    })
  )
  ipcMain.handle('bots:removeCommentDraftAttachment', (_event, args: unknown) =>
    guarded(() => {
      const input = (args ?? {}) as Record<string, unknown>
      return botsCommentDrafts.removeAttachment(draftId(input.id), draftId(input.attachmentId))
    })
  )
  ipcMain.handle('bots:commentDraftAttachmentPreview', (_event, args: unknown) =>
    guarded(async () => {
      const input = (args ?? {}) as Record<string, unknown>
      const mime = text(input.mime, 'mime', 200)
      if (!/^image\/(png|jpeg|gif|webp)$/.test(mime)) {
        throw new InvalidDraftArgument('Only images have a preview.')
      }
      const bytes = await botsCommentDrafts.attachmentBytes(
        draftId(input.id),
        draftId(input.attachmentId)
      )
      if (!bytes.ok) {
        return bytes
      }
      if (bytes.value.byteLength > MAX_PREVIEW_BYTES) {
        throw new InvalidDraftArgument('Too large to preview.')
      }
      return { ok: true, value: `data:${mime};base64,${bytes.value.toString('base64')}` }
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
