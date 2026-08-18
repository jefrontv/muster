// IPC surface for chat mode's workspace/thread store. All handlers are synchronous
// state edits on a small JSON sidecar; session launching stays in the renderer
// (it composes the existing pty:spawn + agent-hooks machinery).

import { ipcMain } from 'electron'
import { getChatGreetingName } from '../chat-mode/chat-greeting-name'
import type { ChatModeState, ChatThread, ChatWorkspace } from '../../shared/chat-mode-types'
import {
  normalizeChatWorkspaceEmails,
  normalizeChatWorkspaceNotes,
  normalizeChatWorkspaceProjects,
  normalizeChatWorkspaceUrls
} from '../../shared/chat-workspace-site-info'
import { sanitizeRepoIcon } from '../../shared/repo-icon'
import { normalizeRepoBadgeColor } from '../../shared/repo-badge-color'
import { chatStore } from '../chat-mode/chat-workspace-store-singleton'

const CHANNELS = [
  'chatMode:getState',
  'chatMode:createWorkspace',
  'chatMode:updateWorkspace',
  'chatMode:deleteWorkspace',
  'chatMode:createThread',
  'chatMode:updateThread',
  'chatMode:deleteThread'
] as const

function asActiveCollabTask(value: unknown): { projectId: number; taskId: number } | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const record = value as { projectId?: unknown; taskId?: unknown }
  if (
    typeof record.projectId !== 'number' ||
    !Number.isFinite(record.projectId) ||
    typeof record.taskId !== 'number' ||
    !Number.isFinite(record.taskId)
  ) {
    return null
  }
  return { projectId: record.projectId, taskId: record.taskId }
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
      patch: {
        name?: unknown
        directories?: unknown
        icon?: unknown
        color?: unknown
        activeCollabProject?: unknown
        activeCollabProjects?: unknown
        urls?: unknown
        clientEmails?: unknown
        notes?: unknown
        iconOverridden?: unknown
      }
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
          : {}),
        ...('activeCollabProjects' in (patch ?? {})
          ? {
              activeCollabProjects: normalizeChatWorkspaceProjects(
                patch.activeCollabProjects,
                patch.activeCollabProject
              )
            }
          : 'activeCollabProject' in (patch ?? {})
            ? {
                activeCollabProjects: normalizeChatWorkspaceProjects(
                  null,
                  patch.activeCollabProject
                )
              }
            : {}),
        ...(patch?.urls !== undefined ? { urls: normalizeChatWorkspaceUrls(patch.urls) } : {}),
        ...(patch?.clientEmails !== undefined
          ? { clientEmails: normalizeChatWorkspaceEmails(patch.clientEmails) }
          : {}),
        ...(patch?.notes !== undefined
          ? { notes: normalizeChatWorkspaceNotes(patch.notes) ?? '' }
          : {}),
        ...(typeof patch?.iconOverridden === 'boolean'
          ? { iconOverridden: patch.iconOverridden }
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
        activeCollabTask?: unknown
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
        ...('activeCollabTask' in (patch ?? {})
          ? { activeCollabTask: asActiveCollabTask(patch.activeCollabTask) }
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
