// IPC surface for chat mode's workspace/thread store. All handlers are synchronous
// state edits on a small JSON sidecar; session launching stays in the renderer
// (it composes the existing pty:spawn + agent-hooks machinery).

import { app, ipcMain } from 'electron'
import { getChatGreetingName } from '../chat-mode/chat-greeting-name'
import type { ChatModeState, ChatThread, ChatWorkspace } from '../../shared/chat-mode-types'
import { sanitizeRepoIcon } from '../../shared/repo-icon'
import { normalizeRepoBadgeColor } from '../../shared/repo-badge-color'
import { ChatWorkspaceStore } from '../chat-mode/chat-workspace-store'

const CHANNELS = [
  'chatMode:getState',
  'chatMode:createWorkspace',
  'chatMode:updateWorkspace',
  'chatMode:deleteWorkspace',
  'chatMode:createThread',
  'chatMode:updateThread',
  'chatMode:deleteThread'
] as const

let storeSingleton: ChatWorkspaceStore | null = null

function chatStore(): ChatWorkspaceStore {
  if (!storeSingleton) {
    storeSingleton = new ChatWorkspaceStore(app.getPath('userData'))
    app.on('before-quit', () => storeSingleton?.flush())
  }
  return storeSingleton
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`chatMode: ${field} must be a non-empty string`)
  }
  return value
}

function asDirectories(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((d) => typeof d !== 'string' || d === '')) {
    throw new Error('chatMode: directories must be a list of non-empty paths')
  }
  return value as string[]
}

export function registerChatModeHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('chatMode:getState', async (): Promise<ChatModeState> => chatStore().getState())

  ipcMain.handle(
    'chatMode:createWorkspace',
    async (_event, args: { name?: unknown; directories?: unknown }): Promise<ChatWorkspace> =>
      chatStore().createWorkspace({
        name: asString(args?.name, 'name'),
        directories: asDirectories(args?.directories)
      })
  )

  ipcMain.handle(
    'chatMode:updateWorkspace',
    async (
      _event,
      id: unknown,
      patch: { name?: unknown; directories?: unknown; icon?: unknown; color?: unknown }
    ): Promise<ChatWorkspace | null> =>
      chatStore().updateWorkspace(asString(id, 'id'), {
        ...(patch?.name !== undefined ? { name: asString(patch.name, 'name') } : {}),
        ...(patch?.directories !== undefined
          ? { directories: asDirectories(patch.directories) }
          : {}),
        // Why: icon/color are sanitized (not asserted) — a malformed value from a
        // stale renderer degrades to the default look instead of failing the save.
        ...('icon' in (patch ?? {}) ? { icon: sanitizeRepoIcon(patch.icon) ?? null } : {}),
        ...(typeof patch?.color === 'string'
          ? { color: normalizeRepoBadgeColor(patch.color) ?? undefined }
          : {})
      })
  )

  ipcMain.handle(
    'chatMode:deleteWorkspace',
    async (_event, id: unknown): Promise<boolean> => chatStore().deleteWorkspace(asString(id, 'id'))
  )

  ipcMain.handle(
    'chatMode:createThread',
    async (_event, args: { workspaceId?: unknown; title?: unknown }): Promise<ChatThread | null> =>
      chatStore().createThread({
        workspaceId: args?.workspaceId === null ? null : asString(args?.workspaceId, 'workspaceId'),
        ...(typeof args?.title === 'string' && args.title !== '' ? { title: args.title } : {})
      })
  )

  ipcMain.handle(
    'chatMode:updateThread',
    async (
      _event,
      id: unknown,
      patch: {
        title?: unknown
        claudeSessionId?: unknown
        transcriptPath?: unknown
        lastActivityAt?: unknown
        lastVisitedAt?: unknown
        lastCompletedAt?: unknown
        contextWindow?: unknown
        sortOrder?: unknown
        archived?: unknown
      }
    ): Promise<ChatThread | null> =>
      chatStore().updateThread(asString(id, 'id'), {
        ...(patch?.title !== undefined ? { title: asString(patch.title, 'title') } : {}),
        ...(typeof patch?.claudeSessionId === 'string'
          ? { claudeSessionId: patch.claudeSessionId }
          : {}),
        ...(typeof patch?.transcriptPath === 'string'
          ? { transcriptPath: patch.transcriptPath }
          : {}),
        ...(typeof patch?.lastActivityAt === 'number'
          ? { lastActivityAt: patch.lastActivityAt }
          : {}),
        ...(typeof patch?.lastVisitedAt === 'number' ? { lastVisitedAt: patch.lastVisitedAt } : {}),
        ...(typeof patch?.lastCompletedAt === 'number'
          ? { lastCompletedAt: patch.lastCompletedAt }
          : {}),
        ...(typeof patch?.contextWindow === 'number' && patch.contextWindow > 0
          ? { contextWindow: patch.contextWindow }
          : {}),
        ...(typeof patch?.sortOrder === 'number' && Number.isFinite(patch.sortOrder)
          ? { sortOrder: patch.sortOrder }
          : {}),
        ...(typeof patch?.archived === 'boolean' ? { archived: patch.archived } : {})
      })
  )

  ipcMain.handle(
    'chatMode:deleteThread',
    async (_event, id: unknown): Promise<boolean> => chatStore().deleteThread(asString(id, 'id'))
  )

  ipcMain.handle(
    'chatMode:getGreetingName',
    async (): Promise<string | null> => getChatGreetingName()
  )
}
