// Persists chat mode's workspaces and threads to their own userData sidecar
// (chat-workspaces.json) rather than the monolithic persistence store: the domain is
// independent and its rows are small pointers — transcripts stay in the agent's files.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  EMPTY_CHAT_MODE_STATE,
  type ChatModeState,
  type ChatThread,
  type ChatWorkspace
} from '../../shared/chat-mode-types'
import { sanitizeRepoIcon } from '../../shared/repo-icon'
import { normalizeRepoBadgeColor } from '../../shared/repo-badge-color'

const CHAT_MODE_FILE_NAME = 'chat-workspaces.json'
const SAVE_DEBOUNCE_MS = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeActiveCollabProject(raw: unknown): { id: number; name: string } | null {
  if (!isRecord(raw) || typeof raw.id !== 'number' || !Number.isFinite(raw.id)) {
    return null
  }
  return { id: raw.id, name: typeof raw.name === 'string' ? raw.name : '' }
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
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : 'Untitled',
    directories,
    ...(icon !== undefined ? { icon } : {}),
    ...(color !== null ? { color } : {}),
    ...(normalizeActiveCollabProject(raw.activeCollabProject)
      ? { activeCollabProject: normalizeActiveCollabProject(raw.activeCollabProject) }
      : {}),
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

export class ChatWorkspaceStore {
  private readonly file: string
  private state: ChatModeState
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private now: () => number

  constructor(baseDir: string, now: () => number = Date.now) {
    this.file = join(baseDir, CHAT_MODE_FILE_NAME)
    this.now = now
    this.state = existsSync(this.file)
      ? this.readState()
      : { ...EMPTY_CHAT_MODE_STATE, workspaces: [], threads: [] }
  }

  private readState(): ChatModeState {
    try {
      return normalizeChatModeState(JSON.parse(readFileSync(this.file, 'utf-8')))
    } catch {
      return { ...EMPTY_CHAT_MODE_STATE, workspaces: [], threads: [] }
    }
  }

  getState(): ChatModeState {
    return this.state
  }

  createWorkspace(args: { name: string; directories: string[] }): ChatWorkspace {
    const at = this.now()
    const workspace: ChatWorkspace = {
      id: randomUUID(),
      name: args.name,
      directories: args.directories,
      createdAt: at,
      updatedAt: at
    }
    this.state = { ...this.state, workspaces: [...this.state.workspaces, workspace] }
    this.scheduleSave()
    return workspace
  }

  updateWorkspace(
    id: string,
    patch: Partial<
      Pick<ChatWorkspace, 'name' | 'directories' | 'icon' | 'color' | 'activeCollabProject'>
    >
  ): ChatWorkspace | null {
    const existing = this.state.workspaces.find((w) => w.id === id)
    if (!existing) {
      return null
    }
    const updated: ChatWorkspace = { ...existing, ...patch, updatedAt: this.now() }
    this.state = {
      ...this.state,
      workspaces: this.state.workspaces.map((w) => (w.id === id ? updated : w))
    }
    this.scheduleSave()
    return updated
  }

  /** Deletes the workspace and every thread in it. */
  deleteWorkspace(id: string): boolean {
    if (!this.state.workspaces.some((w) => w.id === id)) {
      return false
    }
    this.state = {
      version: 1,
      workspaces: this.state.workspaces.filter((w) => w.id !== id),
      threads: this.state.threads.filter((t) => t.workspaceId !== id)
    }
    this.scheduleSave()
    return true
  }

  createThread(args: { workspaceId: string | null; title?: string }): ChatThread | null {
    if (
      args.workspaceId !== null &&
      !this.state.workspaces.some((w) => w.id === args.workspaceId)
    ) {
      return null
    }
    const at = this.now()
    const thread: ChatThread = {
      id: randomUUID(),
      workspaceId: args.workspaceId,
      title: args.title ?? 'New chat',
      agent: 'claude',
      claudeSessionId: null,
      transcriptPath: null,
      createdAt: at,
      lastActivityAt: at
    }
    this.state = { ...this.state, threads: [...this.state.threads, thread] }
    this.scheduleSave()
    return thread
  }

  updateThread(
    id: string,
    patch: Partial<
      Pick<
        ChatThread,
        | 'title'
        | 'claudeSessionId'
        | 'transcriptPath'
        | 'lastActivityAt'
        | 'lastVisitedAt'
        | 'lastCompletedAt'
        | 'contextWindow'
        | 'sortOrder'
        | 'activeCollabTask'
        | 'archived'
      >
    >
  ): ChatThread | null {
    const existing = this.state.threads.find((t) => t.id === id)
    if (!existing) {
      return null
    }
    const updated: ChatThread = { ...existing, ...patch }
    this.state = {
      ...this.state,
      threads: this.state.threads.map((t) => (t.id === id ? updated : t))
    }
    this.scheduleSave()
    return updated
  }

  deleteThread(id: string): boolean {
    if (!this.state.threads.some((t) => t.id === id)) {
      return false
    }
    this.state = { ...this.state, threads: this.state.threads.filter((t) => t.id !== id) }
    this.scheduleSave()
    return true
  }

  private scheduleSave(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
    }
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      this.flush()
    }, SAVE_DEBOUNCE_MS)
  }

  /** Atomic tmp-write + rename so a crash mid-write can't corrupt the store. */
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    mkdirSync(join(this.file, '..'), { recursive: true })
    const tmpFile = `${this.file}.${process.pid}.tmp`
    writeFileSync(tmpFile, `${JSON.stringify(this.state, null, 2)}\n`, 'utf-8')
    renameSync(tmpFile, this.file)
  }
}
