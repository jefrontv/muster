// Parsing the chat-mode sidecar file: every row is validated on load so a
// hand-edited or partially written chat-workspaces.json degrades to the rows it
// can still read instead of taking chat mode down.

import {
  EMPTY_CHAT_MODE_STATE,
  type ChatModeState,
  type ChatThread,
  type ChatWorkspace
} from '../../shared/chat-mode-types'
import { sanitizeRepoIcon } from '../../shared/repo-icon'
import { normalizeRepoBadgeColor } from '../../shared/repo-badge-color'
import {
  normalizeChatWorkspaceEmails,
  normalizeChatWorkspaceNotes,
  normalizeChatWorkspaceProjects,
  normalizeChatWorkspaceUrls
} from '../../shared/chat-workspace-site-info'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeActiveCollabTask(raw: unknown): { projectId: number; taskId: number } | null {
  if (
    !isRecord(raw) ||
    typeof raw.projectId !== 'number' ||
    !Number.isFinite(raw.projectId) ||
    typeof raw.taskId !== 'number' ||
    !Number.isFinite(raw.taskId)
  ) {
    return null
  }
  return { projectId: raw.projectId, taskId: raw.taskId }
}

function normalizeWorkspace(raw: unknown): ChatWorkspace | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') {
    return null
  }
  const directories = Array.isArray(raw.directories)
    ? raw.directories.filter((d): d is string => typeof d === 'string' && d !== '')
    : []
  const icon = sanitizeRepoIcon(raw.icon)
  const color = normalizeRepoBadgeColor(raw.color)
  const urls = normalizeChatWorkspaceUrls(raw.urls)
  const clientEmails = normalizeChatWorkspaceEmails(raw.clientEmails)
  const notes = normalizeChatWorkspaceNotes(raw.notes)
  const projects = normalizeChatWorkspaceProjects(raw.activeCollabProjects, raw.activeCollabProject)
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : 'Untitled',
    directories,
    ...(icon !== undefined ? { icon } : {}),
    ...(color !== null ? { color } : {}),
    ...(projects.length > 0
      ? { activeCollabProjects: projects, activeCollabProject: projects[0] }
      : {}),
    ...(urls.length > 0 ? { urls } : {}),
    ...(clientEmails.length > 0 ? { clientEmails } : {}),
    ...(notes ? { notes } : {}),
    ...(raw.iconOverridden === true ? { iconOverridden: true } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
  }
}

function normalizeThread(raw: unknown, workspaceIds: Set<string>): ChatThread | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') {
    return null
  }
  // null = standalone chat; a dangling workspace pointer drops the thread.
  const workspaceId = typeof raw.workspaceId === 'string' ? raw.workspaceId : null
  if (workspaceId !== null && !workspaceIds.has(workspaceId)) {
    return null
  }
  return {
    id: raw.id,
    workspaceId,
    title: typeof raw.title === 'string' && raw.title !== '' ? raw.title : 'New chat',
    agent: 'claude',
    claudeSessionId: typeof raw.claudeSessionId === 'string' ? raw.claudeSessionId : null,
    transcriptPath: typeof raw.transcriptPath === 'string' ? raw.transcriptPath : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    lastActivityAt: typeof raw.lastActivityAt === 'number' ? raw.lastActivityAt : 0,
    ...(typeof raw.lastVisitedAt === 'number' ? { lastVisitedAt: raw.lastVisitedAt } : {}),
    ...(typeof raw.lastCompletedAt === 'number' ? { lastCompletedAt: raw.lastCompletedAt } : {}),
    ...(typeof raw.contextWindow === 'number' && raw.contextWindow > 0
      ? { contextWindow: raw.contextWindow }
      : {}),
    ...(typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder)
      ? { sortOrder: raw.sortOrder }
      : {}),
    ...(normalizeActiveCollabTask(raw.activeCollabTask)
      ? { activeCollabTask: normalizeActiveCollabTask(raw.activeCollabTask) }
      : {}),
    ...(raw.archived === true ? { archived: true } : {})
  }
}

export function normalizeChatModeState(raw: unknown): ChatModeState {
  if (!isRecord(raw)) {
    return EMPTY_CHAT_MODE_STATE
  }
  const workspaces = Array.isArray(raw.workspaces)
    ? raw.workspaces.map(normalizeWorkspace).filter((w): w is ChatWorkspace => w !== null)
    : []
  const workspaceIds = new Set(workspaces.map((w) => w.id))
  const threads = Array.isArray(raw.threads)
    ? raw.threads
        .map((t) => normalizeThread(t, workspaceIds))
        .filter((t): t is ChatThread => t !== null)
    : []
  return { version: 1, workspaces, threads }
}
