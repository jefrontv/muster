// Module-level cache for the composer's in-progress draft text, keyed by the
// same stable pane scope as image attachments. The composer unmounts when the
// pane toggles back to the hosted terminal, so without this the typed-but-unsent
// draft would be lost on every TUI/GUI round-trip. Mirrors the attachment cache
// so both halves of an unsent message survive toggles and reconnects.
//
// Chat-mode drafts additionally survive a reload or an app restart, backed by
// localStorage. Chat mode already passes a durable scope (`chat-thread:<id>`,
// thread identity rather than pane key), so the key outlived the text — close
// the window mid-sentence and it was gone. Pane-scoped Code-mode drafts stay
// memory-only on purpose: those keys die with the pane, and persisting them
// would accumulate entries nothing can ever match again.

import { setBoundedScopeCacheEntry } from './native-chat-composer-scope-cache'

const draftCache = new Map<string, string>()

/** Only scopes with this prefix are durable; see the note above. */
const PERSISTED_SCOPE_PREFIX = 'chat-thread:'
const STORAGE_KEY = 'muster:native-chat-drafts:v1'
/** Coalesces per-keystroke writes into one. */
const FLUSH_DEBOUNCE_MS = 400

let hydrated = false
let flushTimer: number | null = null

function isPersistedScope(scopeKey: string): boolean {
  return scopeKey.startsWith(PERSISTED_SCOPE_PREFIX)
}

function readStorage(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    const entries: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value !== '' && isPersistedScope(key)) {
        entries[key] = value
      }
    }
    return entries
  } catch {
    // Storage disabled, quota error, or corrupt JSON — drafts are a
    // convenience, never a reason to break the composer.
    return {}
  }
}

function writeStorage(entries: Record<string, string>): void {
  try {
    if (Object.keys(entries).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Same reasoning as readStorage.
  }
}

function persistedEntries(): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const [key, value] of draftCache) {
    if (isPersistedScope(key)) {
      entries[key] = value
    }
  }
  return entries
}

function scheduleFlush(): void {
  if (flushTimer !== null) {
    return
  }
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    writeStorage(persistedEntries())
  }, FLUSH_DEBOUNCE_MS)
}

function ensureHydrated(): void {
  if (hydrated) {
    return
  }
  hydrated = true
  for (const [key, value] of Object.entries(readStorage())) {
    // Never clobber a draft the session already holds.
    if (!draftCache.has(key)) {
      draftCache.set(key, value)
    }
  }
}

export function readNativeChatDraftCache(scopeKey: string): string {
  ensureHydrated()
  return draftCache.get(scopeKey) ?? ''
}

export function writeNativeChatDraftCache(scopeKey: string, draft: string): void {
  ensureHydrated()
  // An empty draft carries no state worth retaining; drop the entry so a stale
  // scope key never resurrects cleared text.
  if (draft === '') {
    draftCache.delete(scopeKey)
    if (isPersistedScope(scopeKey)) {
      scheduleFlush()
    }
    return
  }
  // LRU-bounded so unsent drafts for permanently-removed panes can't accumulate.
  setBoundedScopeCacheEntry(draftCache, scopeKey, draft)
  if (isPersistedScope(scopeKey)) {
    scheduleFlush()
  }
}

/**
 * Drops persisted drafts whose thread no longer exists.
 *
 * A deleted thread's draft would otherwise sit in storage forever — nothing
 * else can ever match its key again.
 */
export function pruneNativeChatPersistedDrafts(liveThreadIds: Iterable<string>): void {
  ensureHydrated()
  const live = new Set<string>()
  for (const id of liveThreadIds) {
    live.add(`${PERSISTED_SCOPE_PREFIX}${id}`)
  }
  let removed = false
  // Map iteration tolerates deleting the current entry, so no copy is needed.
  for (const key of draftCache.keys()) {
    if (isPersistedScope(key) && !live.has(key)) {
      draftCache.delete(key)
      removed = true
    }
  }
  if (removed) {
    scheduleFlush()
  }
}

export function clearNativeChatDraftCacheForTests(): void {
  draftCache.clear()
  hydrated = false
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
