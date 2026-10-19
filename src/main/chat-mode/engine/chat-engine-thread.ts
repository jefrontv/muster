// One chat thread's model plus the bookkeeping needed to build it from the CLI's
// record stream. Record handlers live in chat-engine-apply-*.ts and mutate the
// model only through the ThreadDraft methods, which keep edits immutable and
// track what changed for the next patch.

import type {
  ChatEngineItem,
  ChatEnginePatch,
  ChatEngineSnapshot,
  ChatEngineThreadMeta,
  ChatEngineTurn
} from '../../../shared/chat-engine-types'
import { findItem, settleItems, updateItem } from './chat-engine-tree'

export function emptyChatEngineMeta(threadId: string): ChatEngineThreadMeta {
  return {
    threadId,
    status: 'idle',
    session: {
      sessionId: null,
      model: null,
      effort: null,
      permissionMode: null,
      cwd: null,
      cliVersion: null,
      tools: [],
      slashCommands: [],
      mcpServers: []
    },
    pending: [],
    queue: { items: [], paused: false },
    todos: null,
    suggestions: [],
    contextUsage: null,
    tasks: [],
    totalCostUsd: 0,
    compacting: false,
    lastError: null
  }
}

export class ChatEngineThread {
  readonly threadId: string
  private meta: ChatEngineThreadMeta
  private turns: ChatEngineTurn[] = []
  private version = 0
  private turnCounter = 0
  private dirtyTurnIds = new Set<string>()
  private metaDirty = false
  /** When the last record landed; a turn closed by the next send ends here, not at the send. */
  private lastRecordAt: number | null = null
  /** Streaming block index -> item id, keyed by `${parentToolUseId ?? '_'}|${index}`. */
  readonly streamBlocks = new Map<string, string>()
  /** Current streaming message id per parent (subagents stream concurrently). */
  readonly streamMessageIds = new Map<string, string>()
  /** Next block ordinal per assistant message id, so final records line up with stream indexes. */
  readonly blockOrdinals = new Map<string, number>()
  /** Partial tool input JSON while it streams. */
  readonly toolInputJson = new Map<string, string>()

  constructor(threadId: string) {
    this.threadId = threadId
    this.meta = emptyChatEngineMeta(threadId)
  }

  noteRecord(now: number): void {
    this.lastRecordAt = now
  }

  getMeta(): ChatEngineThreadMeta {
    return this.meta
  }

  setMeta(patch: Partial<ChatEngineThreadMeta>): void {
    this.meta = { ...this.meta, ...patch }
    this.metaDirty = true
  }

  getTurns(): readonly ChatEngineTurn[] {
    return this.turns
  }

  runningTurn(): ChatEngineTurn | null {
    const last = this.turns.at(-1)
    return last && last.status === 'running' ? last : null
  }

  /** The running turn, or a new user-less one for work the CLI started by itself. */
  currentTurn(now: number): ChatEngineTurn {
    return this.runningTurn() ?? this.pushTurn(null, now)
  }

  beginUserTurn(args: {
    text: string
    imageCount: number
    now: number
    uuid?: string | null
  }): ChatEngineTurn {
    // A message sent mid-turn steers the same run; the previous turn stops
    // collecting new output but its in-flight tools still settle by id.
    const running = this.runningTurn()
    if (running) {
      // Resumed history can hold a turn with no result followed by a send days later.
      const endedAt = Math.max(running.startedAt, Math.min(args.now, this.lastRecordAt ?? args.now))
      this.replaceTurn({
        ...running,
        status: 'done',
        endedAt,
        durationMs: endedAt - running.startedAt
      })
    }
    this.setMeta({ suggestions: [], lastError: null })
    return this.pushTurn(
      {
        text: args.text,
        imageCount: args.imageCount,
        sentAt: args.now,
        delivery: 'local',
        uuid: args.uuid ?? null
      },
      args.now
    )
  }

  /** A message written into the running turn; it shows where the model picked it up. */
  addSteer(args: { id: string; text: string; imageCount: number; now: number }): void {
    const turn = this.currentTurn(args.now)
    this.replaceTurn({
      ...turn,
      items: [
        ...turn.items,
        {
          kind: 'steer',
          id: args.id,
          text: args.text,
          imageCount: args.imageCount,
          delivered: false
        }
      ]
    })
  }

  /** The CLI echoed a message we sent; false when no local turn or steer carries this uuid. */
  markDelivered(uuid: string): boolean {
    for (let index = this.turns.length - 1; index >= 0; index -= 1) {
      const turn = this.turns[index]
      if (!turn) {
        continue
      }
      if (turn.user?.uuid === uuid) {
        if (turn.user.delivery !== 'delivered') {
          this.replaceTurn({ ...turn, user: { ...turn.user, delivery: 'delivered' } })
        }
        return true
      }
      const steer = turn.items.find((item) => item.kind === 'steer' && item.id === uuid)
      if (steer) {
        this.replaceTurn(
          updateItem(turn, uuid, (item) =>
            item.kind === 'steer' ? { ...item, delivered: true } : item
          )
        )
        return true
      }
    }
    return false
  }

  private pushTurn(user: ChatEngineTurn['user'], now: number): ChatEngineTurn {
    this.turnCounter += 1
    const turn: ChatEngineTurn = {
      id: `turn-${this.turnCounter}-${now.toString(36)}`,
      index: this.turns.length,
      user,
      items: [],
      status: 'running',
      startedAt: now,
      endedAt: null,
      durationMs: null,
      costUsd: null,
      errorMessage: null,
      toolSummaries: []
    }
    this.turns = [...this.turns, turn]
    this.dirtyTurnIds.add(turn.id)
    return turn
  }

  replaceTurn(turn: ChatEngineTurn): void {
    const index = this.turns.findIndex((candidate) => candidate.id === turn.id)
    if (index === -1 || this.turns[index] === turn) {
      return
    }
    const next = [...this.turns]
    next[index] = turn
    this.turns = next
    this.dirtyTurnIds.add(turn.id)
  }

  /** The newest turn that holds an item with this id. */
  turnWithItem(itemId: string): ChatEngineTurn | null {
    for (let index = this.turns.length - 1; index >= 0; index -= 1) {
      const turn = this.turns[index]
      if (turn && findItem(turn.items, itemId)) {
        return turn
      }
    }
    return null
  }

  updateItemAnywhere(itemId: string, update: (item: ChatEngineItem) => ChatEngineItem): boolean {
    const turn = this.turnWithItem(itemId)
    if (!turn) {
      return false
    }
    this.replaceTurn(updateItem(turn, itemId, update))
    return true
  }

  /** The oldest undelivered turn sent without a uuid; uuid-carrying sends match exactly instead. */
  turnAwaitingDelivery(): ChatEngineTurn | null {
    return (
      this.turns.find((turn) => turn.user?.delivery === 'local' && turn.user.uuid === null) ?? null
    )
  }

  endRunningTurns(args: {
    now: number
    status: 'done' | 'error' | 'interrupted'
    durationMs?: number | null
    costUsd?: number | null
    errorMessage?: string | null
  }): void {
    for (const turn of this.turns) {
      const hasLiveItems = turn.items.some(
        (item) =>
          (item.kind === 'tool' && (item.status === 'running' || item.status === 'streaming')) ||
          (item.kind === 'agent' && item.status === 'running') ||
          ((item.kind === 'text' || item.kind === 'thinking') && item.streaming)
      )
      if (turn.status !== 'running' && !hasLiveItems) {
        continue
      }
      const isLast = turn === this.turns.at(-1)
      const settled: ChatEngineTurn = {
        ...turn,
        items: settleItems(turn.items, args.status === 'done' ? 'done' : 'interrupted')
      }
      this.replaceTurn(
        turn.status === 'running' && isLast
          ? {
              ...settled,
              status: args.status,
              endedAt: args.now,
              durationMs: args.durationMs ?? args.now - turn.startedAt,
              costUsd: args.costUsd ?? null,
              errorMessage: args.errorMessage ?? null
            }
          : settled
      )
    }
    this.streamBlocks.clear()
    this.streamMessageIds.clear()
    this.toolInputJson.clear()
  }

  /** Recompute the thread status from the model; called after every record. */
  refreshStatus(): void {
    const status: ChatEngineThreadMeta['status'] =
      this.meta.status === 'stopped' || this.meta.status === 'starting'
        ? this.meta.status
        : this.meta.pending.length > 0
          ? 'waiting'
          : this.runningTurn()
            ? 'working'
            : this.turns.at(-1)?.status === 'error'
              ? 'error'
              : 'idle'
    if (status !== this.meta.status) {
      this.setMeta({ status })
    }
  }

  hasChanges(): boolean {
    return this.metaDirty || this.dirtyTurnIds.size > 0
  }

  takePatch(): ChatEnginePatch | null {
    if (!this.hasChanges()) {
      return null
    }
    this.version += 1
    const turns = this.turns.filter((turn) => this.dirtyTurnIds.has(turn.id))
    const patch: ChatEnginePatch = {
      threadId: this.threadId,
      version: this.version,
      ...(this.metaDirty ? { meta: this.meta } : {}),
      ...(turns.length > 0 ? { turns } : {})
    }
    this.metaDirty = false
    this.dirtyTurnIds.clear()
    return patch
  }

  /** Restored history goes before anything recorded since this thread was created. */
  mergeHistory(restored: ChatEngineSnapshot): void {
    const liveIds = new Set(this.turns.map((turn) => turn.id))
    const live = this.meta
    this.turns = [...restored.turns.filter((turn) => !liveIds.has(turn.id)), ...this.turns]
    this.turnCounter = Math.max(this.turnCounter, this.turns.length)
    this.version = Math.max(this.version, restored.version)
    this.meta = {
      ...live,
      session: live.session.sessionId ? live.session : restored.meta.session,
      todos: live.todos ?? restored.meta.todos,
      contextUsage: live.contextUsage ?? restored.meta.contextUsage,
      tasks: [...(restored.meta.tasks ?? []), ...live.tasks],
      totalCostUsd: restored.meta.totalCostUsd + live.totalCostUsd
    }
    this.metaDirty = true
  }

  snapshot(): ChatEngineSnapshot {
    return { version: this.version, meta: this.meta, turns: this.turns }
  }
}
