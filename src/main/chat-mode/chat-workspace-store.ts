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
  type ChatWorkspace,
  type ChatWorkspacePatch
} from '../../shared/chat-mode-types'
import { normalizeChatModeState } from './chat-workspace-state-parse'
import {
  normalizeChatWorkspaceEmails,
  normalizeChatWorkspaceNotes,
  normalizeChatWorkspaceProjects,
  normalizeChatWorkspaceUrls
} from '../../shared/chat-workspace-site-info'

const CHAT_MODE_FILE_NAME = 'chat-workspaces.json'
const SAVE_DEBOUNCE_MS = 100

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

  updateWorkspace(id: string, patch: ChatWorkspacePatch): ChatWorkspace | null {
    const existing = this.state.workspaces.find((w) => w.id === id)
    if (!existing) {
      return null
    }
    const { urls, clientEmails, notes, iconOverridden, activeCollabProjects, ...rest } = patch
    const updated: ChatWorkspace = { ...existing, ...rest, updatedAt: this.now() }
    if (activeCollabProjects !== undefined) {
      const nextProjects = normalizeChatWorkspaceProjects(activeCollabProjects)
      if (nextProjects.length > 0) {
        updated.activeCollabProjects = nextProjects
        updated.activeCollabProject = nextProjects[0]
      } else {
        delete updated.activeCollabProjects
        delete updated.activeCollabProject
      }
    }
    if (urls !== undefined) {
      const nextUrls = normalizeChatWorkspaceUrls(urls)
      if (nextUrls.length > 0) {
        updated.urls = nextUrls
      } else {
        delete updated.urls
      }
    }
    if (clientEmails !== undefined) {
      const nextEmails = normalizeChatWorkspaceEmails(clientEmails)
      if (nextEmails.length > 0) {
        updated.clientEmails = nextEmails
      } else {
        delete updated.clientEmails
      }
    }
    if (notes !== undefined) {
      const nextNotes = normalizeChatWorkspaceNotes(notes)
      if (nextNotes) {
        updated.notes = nextNotes
      } else {
        delete updated.notes
      }
    }
    if (iconOverridden !== undefined) {
      if (iconOverridden) {
        updated.iconOverridden = true
      } else {
        delete updated.iconOverridden
      }
    }
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

  /**
   * Moves a thread between workspaces (null = the ungrouped Chats section).
   * Separate from updateThread because the target has to exist: a bad id would
   * otherwise orphan the thread out of every list until the next load pruned it.
   */
  moveThread(id: string, workspaceId: string | null): ChatThread | null {
    const existing = this.state.threads.find((t) => t.id === id)
    if (!existing) {
      return null
    }
    if (workspaceId !== null && !this.state.workspaces.some((w) => w.id === workspaceId)) {
      return null
    }
    const updated: ChatThread = { ...existing, workspaceId }
    this.state = {
      ...this.state,
      threads: this.state.threads.map((t) => (t.id === id ? updated : t))
    }
    this.scheduleSave()
    return updated
  }

  updateThread(
    id: string,
    patch: Partial<
      Pick<
        ChatThread,
        | 'title'
        | 'autoTitle'
        | 'titleGenerated'
        | 'claudeSessionId'
        | 'transcriptPath'
        | 'lastActivityAt'
        | 'lastVisitedAt'
        | 'lastCompletedAt'
        | 'contextWindow'
        | 'sortOrder'
        | 'activeCollabTask'
        | 'archived'
        | 'pinned'
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
