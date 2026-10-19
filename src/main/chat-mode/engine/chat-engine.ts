// Main-process owner of every chat thread's model. The stream layer feeds it raw
// records; renderers subscribe for a snapshot and then receive patches. Living
// here (not in a renderer) is what lets a turn survive a reload or a closed window.

import type {
  ChatEngineCapabilities,
  ChatEnginePatch,
  ChatEngineSnapshot,
  ChatEngineThreadMeta
} from '../../../shared/chat-engine-types'
import type { ChatThreadMessageQueueSnapshot } from '../../../shared/chat-thread-stream-types'
import { CHAT_ENGINE_PATCH_CHANNEL } from '../../../shared/chat-engine-types'
import { applyChatEngineRecord } from './chat-engine-apply'
import { parseChatEngineCapabilities } from './chat-engine-capabilities'
import { resolvePending } from './chat-engine-apply-control'
import { appliedSessionSettings } from './chat-engine-control-actions'
import { ChatEngineControlClient } from './chat-engine-control'
import { deleteChatEngineSnapshot, writeChatEngineSnapshot } from './chat-engine-persistence'
import { createChatEngineRestore, type ChatEngineRestore } from './chat-engine-restore'
import { ChatEngineThread } from './chat-engine-thread'
import type { Rec } from './chat-engine-records'

const FLUSH_MS = 50
const PERSIST_MS = 1_500

export type ChatEngineSubscriber = {
  id: number
  send: (channel: string, payload: ChatEnginePatch) => void
  isDestroyed: () => boolean
}

type Entry = {
  thread: ChatEngineThread
  control: ChatEngineControlClient | null
  capabilities: ChatEngineCapabilities | null
  subscribers: Map<number, ChatEngineSubscriber>
  /** Settles once saved history is merged in; snapshots are not written before it. */
  loaded: Promise<void>
  flushTimer: ReturnType<typeof setTimeout> | null
  persistTimer: ReturnType<typeof setTimeout> | null
}

export type ChatEngineDeps = {
  now?: () => number
  persistDir?: () => string | null
  /** History for a thread not yet in memory; defaults to its snapshot file. */
  restore?: ChatEngineRestore
}

export class ChatEngine {
  private readonly entries = new Map<string, Entry>()
  private readonly now: () => number
  private readonly persistDir: () => string | null
  private readonly restore: ChatEngineRestore

  constructor(deps: ChatEngineDeps = {}) {
    this.now = deps.now ?? Date.now
    this.persistDir = deps.persistDir ?? (() => null)
    this.restore = deps.restore ?? createChatEngineRestore({ persistDir: this.persistDir })
  }

  private entry(threadId: string): Entry {
    const existing = this.entries.get(threadId)
    if (existing) {
      return existing
    }
    const thread = new ChatEngineThread(threadId)
    const entry: Entry = {
      thread,
      control: null,
      capabilities: null,
      subscribers: new Map(),
      // Records can arrive while this reads; mergeHistory puts the history before them.
      loaded: this.restore(threadId).then(
        (restored) => {
          if (restored) {
            thread.mergeHistory(restored)
          }
        },
        (error: unknown) => console.warn('[chat-engine] history restore failed:', error)
      ),
      flushTimer: null,
      persistTimer: null
    }
    this.entries.set(threadId, entry)
    return entry
  }

  /** A child process started for this thread; returns its control client. */
  attachProcess(threadId: string, write: (payload: unknown) => boolean): ChatEngineControlClient {
    const entry = this.entry(threadId)
    entry.control?.dispose()
    entry.control = new ChatEngineControlClient(write)
    entry.capabilities = null
    entry.thread.setMeta({ status: 'starting', pending: [], lastError: null })
    this.schedule(entry)
    return entry.control
  }

  control(threadId: string): ChatEngineControlClient | null {
    return this.entries.get(threadId)?.control ?? null
  }

  /** Ignored unless `control` is still the thread's live process. */
  setCapabilities(threadId: string, control: ChatEngineControlClient, response: unknown): void {
    const entry = this.entries.get(threadId)
    if (entry?.control === control) {
      entry.capabilities = parseChatEngineCapabilities(response)
    }
  }

  capabilities(threadId: string): ChatEngineCapabilities | null {
    return this.entries.get(threadId)?.capabilities ?? null
  }

  /** Folds the CLI's applied model and effort into the session; an alias arrives resolved. */
  async refreshAppliedSettings(threadId: string, control: ChatEngineControlClient): Promise<void> {
    const response = await control.request('get_settings', {}).catch(() => null)
    const applied = appliedSessionSettings(response)
    const entry = this.entries.get(threadId)
    if (applied && entry?.control === control) {
      entry.thread.setMeta({ session: { ...entry.thread.getMeta().session, ...applied } })
      this.schedule(entry)
    }
  }

  ingest(threadId: string, record: Rec): void {
    const entry = this.entry(threadId)
    if (entry.control?.handleRecord(record)) {
      return
    }
    if (entry.thread.getMeta().status === 'starting' && record.type === 'system') {
      entry.thread.setMeta({ status: 'idle' })
    }
    const wasRunning = entry.thread.runningTurn() !== null
    applyChatEngineRecord(entry.thread, record, this.now())
    const turnEnded = wasRunning && entry.thread.runningTurn() === null
    this.schedule(entry, turnEnded)
  }

  /** A user message reached the CLI's stdin: a new turn, or a steer into the running one. */
  userMessage(
    threadId: string,
    message: { id: string; text: string; imageCount: number; steer: boolean }
  ): void {
    const entry = this.entry(threadId)
    if (entry.thread.getMeta().status === 'starting') {
      entry.thread.setMeta({ status: 'idle' })
    }
    const now = this.now()
    if (message.steer && entry.thread.runningTurn()) {
      entry.thread.addSteer({ ...message, now })
    } else {
      entry.thread.beginUserTurn({ ...message, uuid: message.id, now })
    }
    entry.thread.refreshStatus()
    this.schedule(entry)
  }

  /** Folds a control request's answer into the thread (model switch, context usage). */
  updateMeta(threadId: string, patch: Partial<ChatEngineThreadMeta>): void {
    const entry = this.entries.get(threadId)
    if (entry) {
      entry.thread.setMeta(patch)
      this.schedule(entry)
    }
  }

  setQueue(threadId: string, queue: ChatThreadMessageQueueSnapshot): void {
    const entry = this.entry(threadId)
    entry.thread.setMeta({ queue })
    this.schedule(entry)
  }

  /** Our verdict on a pending request was written; drop it from the model. */
  resolvePermission(threadId: string, requestId: string, behavior: 'allow' | 'deny'): void {
    const entry = this.entries.get(threadId)
    if (!entry) {
      return
    }
    resolvePending(entry.thread, requestId, behavior === 'allow' ? 'allowed' : 'denied')
    entry.thread.refreshStatus()
    this.schedule(entry)
  }

  /** `control` identifies the exiting process: a relaunch's old child closes after the new one attached. */
  processExited(
    threadId: string,
    control: ChatEngineControlClient,
    args: { stopping: boolean; error: string | null }
  ): void {
    control.dispose()
    const entry = this.entries.get(threadId)
    if (!entry || entry.control !== control) {
      return
    }
    entry.control = null
    entry.capabilities = null
    entry.thread.endRunningTurns({
      now: this.now(),
      status: 'interrupted',
      errorMessage: args.stopping ? null : args.error
    })
    entry.thread.setMeta({
      status: 'stopped',
      pending: [],
      ...(args.stopping ? {} : { lastError: args.error })
    })
    this.schedule(entry, true)
  }

  /** Snapshot for a new subscriber, once the thread's saved history is loaded. */
  async subscribe(threadId: string, subscriber: ChatEngineSubscriber): Promise<ChatEngineSnapshot> {
    const entry = this.entry(threadId)
    await entry.loaded
    entry.subscribers.set(subscriber.id, subscriber)
    this.flush(entry)
    return entry.thread.snapshot()
  }

  unsubscribe(threadId: string, subscriberId: number): void {
    this.entries.get(threadId)?.subscribers.delete(subscriberId)
  }

  unsubscribeEverywhere(subscriberId: number): void {
    for (const entry of this.entries.values()) {
      entry.subscribers.delete(subscriberId)
    }
  }

  /** A window is showing (or just showed) this thread. */
  isWatched(threadId: string): boolean {
    return (this.entries.get(threadId)?.subscribers.size ?? 0) > 0
  }

  snapshot(threadId: string): ChatEngineSnapshot | null {
    return this.entries.get(threadId)?.thread.snapshot() ?? null
  }

  async forget(threadId: string): Promise<void> {
    const entry = this.entries.get(threadId)
    if (entry) {
      entry.control?.dispose()
      if (entry.flushTimer) {
        clearTimeout(entry.flushTimer)
      }
      if (entry.persistTimer) {
        clearTimeout(entry.persistTimer)
      }
      this.entries.delete(threadId)
    }
    const dir = this.persistDir()
    if (dir) {
      await deleteChatEngineSnapshot(dir, threadId)
    }
  }

  private schedule(entry: Entry, persistNow = false): void {
    if (!entry.flushTimer) {
      entry.flushTimer = setTimeout(() => {
        entry.flushTimer = null
        this.flush(entry)
      }, FLUSH_MS)
      entry.flushTimer.unref?.()
    }
    if (persistNow) {
      this.persist(entry)
    } else if (!entry.persistTimer) {
      entry.persistTimer = setTimeout(() => this.persist(entry), PERSIST_MS)
      entry.persistTimer.unref?.()
    }
  }

  private flush(entry: Entry): void {
    const patch = entry.thread.takePatch()
    if (!patch) {
      return
    }
    for (const [id, subscriber] of entry.subscribers) {
      if (subscriber.isDestroyed()) {
        entry.subscribers.delete(id)
        continue
      }
      try {
        subscriber.send(CHAT_ENGINE_PATCH_CHANNEL, patch)
      } catch {
        entry.subscribers.delete(id)
      }
    }
  }

  private persist(entry: Entry): void {
    if (entry.persistTimer) {
      clearTimeout(entry.persistTimer)
      entry.persistTimer = null
    }
    const dir = this.persistDir()
    if (!dir) {
      return
    }
    // Writing before the history merge would replace the saved history with only the new turns.
    void entry.loaded
      .then(() => writeChatEngineSnapshot(dir, entry.thread.snapshot()))
      .catch((error: unknown) => {
        console.warn('[chat-engine] snapshot write failed:', error)
      })
  }

  /** Flush pending patches and snapshots synchronously enough for app quit. */
  flushAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.flushTimer) {
        clearTimeout(entry.flushTimer)
        entry.flushTimer = null
      }
      this.flush(entry)
      if (entry.persistTimer) {
        this.persist(entry)
      }
    }
  }
}
