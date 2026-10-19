// Renderer mirror of main's chat engine: one view per retained thread, kept
// current by numbered patches. Patches fold in as they arrive, but listeners hear
// about them once per frame, and unchanged turns keep their object identity.

import type { ChatEngineApi } from '../../../../preload/api-types'
import type {
  ChatEnginePatch,
  ChatEngineSnapshot,
  ChatEngineThreadMeta,
  ChatEngineTurn
} from '../../../../shared/chat-engine-types'
import { applyChatEnginePatch } from '../../../../shared/chat-engine-patch'
import { replaceEqualDeep } from './chat-engine-structural-sharing'

export type ChatEngineThreadView = {
  version: number
  meta: ChatEngineThreadMeta
  /** Turn ids in display order; same array until a turn is added. */
  order: string[]
  turns: ReadonlyMap<string, ChatEngineTurn>
}

type Slot = {
  snapshot: ChatEngineSnapshot | null
  view: ChatEngineThreadView | null
  refs: number
  /** Patches that arrived while a (re)subscribe was in flight. */
  early: ChatEnginePatch[] | null
  releaseTimer: ReturnType<typeof setTimeout> | null
  /** Filled by a renderer adapter (Code mode), never by main. */
  local: boolean
}

export type ChatEngineThreadStore = {
  /** Keeps the thread's view live; call the returned function to let it go. */
  retain: (threadId: string) => () => void
  subscribe: (threadId: string, listener: () => void) => () => void
  read: (threadId: string) => ChatEngineThreadView | null
  /** Sets a renderer-owned thread whole; main is never asked about it. */
  replaceLocal: (threadId: string, meta: ChatEngineThreadMeta, turns: ChatEngineTurn[]) => void
  /** Forgets a renderer-owned thread once its view is gone. */
  dropLocal: (threadId: string) => void
  dispose: () => void
}

type StoreDeps = {
  api: Pick<ChatEngineApi, 'subscribe' | 'unsubscribe' | 'onPatch'>
  scheduleFrame?: (callback: () => void) => void
  /** Keeps a thread warm after its view unmounts, so switching back is instant. */
  releaseDelayMs?: number
}

/** Only turns that arrive over IPC are compared; the rest already carry shared identity. */
function shareTurns(prev: readonly ChatEngineTurn[], next: ChatEngineTurn[]): ChatEngineTurn[] {
  const byId = new Map(prev.map((turn) => [turn.id, turn]))
  return next.map((turn) => replaceEqualDeep(byId.get(turn.id), turn))
}

function viewFrom(snapshot: ChatEngineSnapshot, prev: ChatEngineThreadView | null) {
  const order = snapshot.turns.map((turn) => turn.id)
  const sameOrder =
    prev?.order.length === order.length && order.every((id, index) => prev.order[index] === id)
  return {
    version: snapshot.version,
    meta: snapshot.meta,
    order: sameOrder ? prev.order : order,
    turns: new Map(snapshot.turns.map((turn) => [turn.id, turn]))
  }
}

// Hidden windows (minimised, another Space) get no animation frames; the timer keeps patches landing.
const HIDDEN_FRAME_FALLBACK_MS = 100

/** The next animation frame, or a short timer when the window is not painting. Runs once. */
export function scheduleChatEngineFrame(callback: () => void): void {
  let ran = false
  const run = (): void => {
    if (!ran) {
      ran = true
      callback()
    }
  }
  requestAnimationFrame(run)
  setTimeout(run, HIDDEN_FRAME_FALLBACK_MS)
}

export function createChatEngineThreadStore(deps: StoreDeps): ChatEngineThreadStore {
  const scheduleFrame = deps.scheduleFrame ?? scheduleChatEngineFrame
  const releaseDelayMs = deps.releaseDelayMs ?? 30_000
  const slots = new Map<string, Slot>()
  // Kept apart from slots: child rows subscribe before the surface's retain effect runs.
  const listeners = new Map<string, Set<() => void>>()
  const dirty = new Set<string>()
  let frameScheduled = false
  let stopPatches: (() => void) | null = null

  const flushFrame = (): void => {
    frameScheduled = false
    const threadIds = [...dirty]
    dirty.clear()
    for (const threadId of threadIds) {
      const slot = slots.get(threadId)
      if (slot?.snapshot) {
        slot.view = viewFrom(slot.snapshot, slot.view)
      }
      for (const listener of listeners.get(threadId) ?? []) {
        listener()
      }
    }
  }

  const markDirty = (threadId: string): void => {
    dirty.add(threadId)
    if (!frameScheduled) {
      frameScheduled = true
      scheduleFrame(flushFrame)
    }
  }

  const load = (threadId: string, slot: Slot): void => {
    slot.early = []
    deps.api.subscribe(threadId).then(
      (snapshot) => {
        if (slots.get(threadId) !== slot || slot.local) {
          return
        }
        const early = slot.early ?? []
        slot.early = null
        slot.snapshot = {
          version: snapshot.version,
          meta: replaceEqualDeep(slot.snapshot?.meta, snapshot.meta),
          turns: shareTurns(slot.snapshot?.turns ?? [], snapshot.turns)
        }
        for (const patch of early) {
          if (!fold(threadId, slot, patch)) {
            return
          }
        }
        markDirty(threadId)
      },
      (error: unknown) => {
        if (slots.get(threadId) === slot) {
          slot.early = null
        }
        console.warn('[chat-engine] subscribe failed:', error)
      }
    )
  }

  /** False when a gap sent the slot back to subscribing. */
  const fold = (threadId: string, slot: Slot, patch: ChatEnginePatch): boolean => {
    if (slot.early || !slot.snapshot) {
      slot.early?.push(patch)
      return true
    }
    const current = slot.snapshot
    const next = applyChatEnginePatch(current, {
      ...patch,
      ...(patch.meta ? { meta: replaceEqualDeep(current.meta, patch.meta) } : {}),
      ...(patch.turns ? { turns: shareTurns(current.turns, patch.turns) } : {})
    })
    if (next === 'gap') {
      // The stale view stays on screen until the fresh snapshot replaces it.
      load(threadId, slot)
      return false
    }
    if (next !== slot.snapshot) {
      slot.snapshot = next
      markDirty(threadId)
    }
    return true
  }

  const ensurePatchListener = (): void => {
    stopPatches ??= deps.api.onPatch((patch) => {
      const slot = slots.get(patch.threadId)
      if (slot && !slot.local) {
        fold(patch.threadId, slot, patch)
      }
    })
  }

  return {
    retain(threadId) {
      ensurePatchListener()
      let slot = slots.get(threadId)
      if (!slot) {
        slot = {
          snapshot: null,
          view: null,
          refs: 0,
          early: null,
          releaseTimer: null,
          local: false
        }
        slots.set(threadId, slot)
        load(threadId, slot)
      }
      const held = slot
      if (held.releaseTimer) {
        clearTimeout(held.releaseTimer)
        held.releaseTimer = null
      }
      held.refs += 1
      let released = false
      return () => {
        if (released) {
          return
        }
        released = true
        held.refs -= 1
        if (held.refs > 0 || held.local) {
          return
        }
        held.releaseTimer = setTimeout(() => {
          if (held.refs === 0 && slots.get(threadId) === held) {
            slots.delete(threadId)
            void deps.api.unsubscribe(threadId).catch(() => undefined)
          }
        }, releaseDelayMs)
      }
    },

    subscribe(threadId, listener) {
      let set = listeners.get(threadId)
      if (!set) {
        set = new Set()
        listeners.set(threadId, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
        if (set.size === 0 && listeners.get(threadId) === set) {
          listeners.delete(threadId)
        }
      }
    },

    read: (threadId) => slots.get(threadId)?.view ?? null,

    replaceLocal(threadId, meta, turns) {
      let slot = slots.get(threadId)
      if (!slot) {
        slot = { snapshot: null, view: null, refs: 0, early: null, releaseTimer: null, local: true }
        slots.set(threadId, slot)
      }
      // A retain that got here first started a subscribe; local data wins over it.
      slot.local = true
      slot.early = null
      const current = slot.snapshot
      slot.snapshot = {
        version: (current?.version ?? 0) + 1,
        meta: replaceEqualDeep(current?.meta, meta),
        turns: shareTurns(current?.turns ?? [], turns)
      }
      // The writer renders above the surface, so the surface reads this pass's turns; rows hear next frame.
      slot.view = viewFrom(slot.snapshot, slot.view)
      markDirty(threadId)
    },

    dropLocal(threadId) {
      const slot = slots.get(threadId)
      if (!slot?.local) {
        return
      }
      if (slot.releaseTimer) {
        clearTimeout(slot.releaseTimer)
      }
      slots.delete(threadId)
      markDirty(threadId)
    },

    dispose() {
      stopPatches?.()
      stopPatches = null
      for (const slot of slots.values()) {
        if (slot.releaseTimer) {
          clearTimeout(slot.releaseTimer)
        }
      }
      slots.clear()
      listeners.clear()
      dirty.clear()
    }
  }
}

let defaultStore: ChatEngineThreadStore | null = null

export function chatEngineThreadStore(): ChatEngineThreadStore {
  defaultStore ??= createChatEngineThreadStore({ api: window.api.chatEngine })
  return defaultStore
}

/** Tests only: swap the store the hooks read; null restores the default. */
export function replaceChatEngineThreadStore(store: ChatEngineThreadStore | null): void {
  defaultStore?.dispose()
  defaultStore = store
}
