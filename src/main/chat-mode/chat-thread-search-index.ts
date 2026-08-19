// Searchable text for every chat thread, cached per transcript file.
//
// Why not SQLite: this repo has no SQLite dependency, and adding one to answer
// a sidebar filter would be a large amount of new surface for a small feature.
// The precedent it follows instead is ai-vault's session-parse-cache — a
// debounced, schema-versioned JSON sidecar under userData, written 0600, thrown
// away whole on a version mismatch.
//
// A thread is re-read only when its transcript's mtime or size moves, so the
// steady state is a map lookup rather than disk work.

import { mkdir, rename, rm, stat, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isTextBlock, type NativeChatMessage } from '../../shared/native-chat-types'
import {
  CHAT_SEARCH_MAX_RESULTS,
  type ChatThreadSearchMatch
} from '../../shared/chat-thread-search-types'
import { buildSearchSnippet, normalizeSearchText } from './chat-thread-search-snippet'

/** Bump when the entry layout changes; a mismatched file is discarded whole. */
const SCHEMA_VERSION = 1
const SAVE_DEBOUNCE_MS = 1_500
const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
/** Transcript text is unbounded; cap what any one thread contributes. */
const MAX_INDEXED_CHARS_PER_THREAD = 400_000

export type ChatSearchEntry = { source: 'user' | 'assistant'; text: string }

type ThreadIndex = {
  mtimeMs: number
  sizeBytes: number
  entries: ChatSearchEntry[]
}

export type ChatSearchIndexTarget = {
  threadId: string
  transcriptPath: string
}

const index = new Map<string, ThreadIndex>()

let filePath: string | null = null
let loadPromise: Promise<void> | null = null
let saveTimer: NodeJS.Timeout | null = null
let lastSave: Promise<void> = Promise.resolve()

export function initChatThreadSearchIndex(next: { filePath: string }): void {
  filePath = next.filePath
}

export function resetChatThreadSearchIndexForTests(): void {
  index.clear()
  filePath = null
  loadPromise = null
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  lastSave = Promise.resolve()
}

/**
 * Only user prose and assistant prose are indexed.
 *
 * Tool calls and their results are excluded on purpose: they are mostly file
 * paths and JSON, and matching them would bury real conversation hits under
 * noise a Chat-mode user cannot act on.
 */
export function messagesToSearchEntries(messages: readonly NativeChatMessage[]): ChatSearchEntry[] {
  const entries: ChatSearchEntry[] = []
  let budget = MAX_INDEXED_CHARS_PER_THREAD
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue
    }
    const text = normalizeSearchText(
      message.blocks.map((block) => (isTextBlock(block) ? block.text : '')).join(' ')
    )
    if (text === '') {
      continue
    }
    const clipped = text.slice(0, budget)
    entries.push({ source: message.role, text: clipped })
    budget -= clipped.length
    if (budget <= 0) {
      break
    }
  }
  return entries
}

/** First match in a thread's entries, preferring whichever comes first. */
export function findThreadMatch(
  threadId: string,
  entries: readonly ChatSearchEntry[],
  normalizedQuery: string
): ChatThreadSearchMatch | null {
  for (const entry of entries) {
    const snippet = buildSearchSnippet(entry.text, normalizedQuery)
    if (snippet !== null) {
      return { threadId, source: entry.source, snippet }
    }
  }
  return null
}

/** Refreshes one thread's entries when its transcript changed. */
export async function ensureThreadIndexed(
  target: ChatSearchIndexTarget,
  readMessages: (transcriptPath: string) => Promise<readonly NativeChatMessage[]>
): Promise<ChatSearchEntry[]> {
  let stats: { mtimeMs: number; size: number }
  try {
    stats = await stat(target.transcriptPath)
  } catch {
    // Transcript gone (deleted session, moved profile): drop any stale entry
    // rather than searching text that no longer exists.
    index.delete(target.threadId)
    return []
  }
  const cached = index.get(target.threadId)
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.sizeBytes === stats.size) {
    return cached.entries
  }
  let entries: ChatSearchEntry[] = []
  try {
    entries = messagesToSearchEntries(await readMessages(target.transcriptPath))
  } catch {
    // An unreadable transcript costs this thread's hits, not the whole search.
    return cached?.entries ?? []
  }
  index.set(target.threadId, { mtimeMs: stats.mtimeMs, sizeBytes: stats.size, entries })
  scheduleSave()
  return entries
}

/** Searches the given threads, reading only the ones whose transcript moved. */
export async function searchChatThreads(
  targets: readonly ChatSearchIndexTarget[],
  normalizedQuery: string,
  readMessages: (transcriptPath: string) => Promise<readonly NativeChatMessage[]>
): Promise<{ matches: ChatThreadSearchMatch[]; truncated: boolean }> {
  await ensureLoaded()
  const matches: ChatThreadSearchMatch[] = []
  for (const target of targets) {
    const entries = await ensureThreadIndexed(target, readMessages)
    const match = findThreadMatch(target.threadId, entries, normalizedQuery)
    if (match !== null) {
      matches.push(match)
      if (matches.length >= CHAT_SEARCH_MAX_RESULTS) {
        return { matches, truncated: true }
      }
    }
  }
  return { matches, truncated: false }
}

/** Drops entries for threads that no longer exist. */
export function pruneChatThreadSearchIndex(liveThreadIds: Iterable<string>): void {
  const live = new Set(liveThreadIds)
  let removed = false
  for (const threadId of index.keys()) {
    if (!live.has(threadId)) {
      index.delete(threadId)
      removed = true
    }
  }
  if (removed) {
    scheduleSave()
  }
}

function ensureLoaded(): Promise<void> {
  if (filePath === null) {
    return Promise.resolve()
  }
  loadPromise ??= load(filePath)
  return loadPromise
}

async function load(path: string): Promise<void> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return
    }
    const file = parsed as { schemaVersion?: unknown; threads?: unknown }
    if (file.schemaVersion !== SCHEMA_VERSION || typeof file.threads !== 'object') {
      return
    }
    for (const [threadId, value] of Object.entries(file.threads as Record<string, unknown>)) {
      const entry = parseThreadIndex(value)
      if (entry !== null) {
        index.set(threadId, entry)
      }
    }
  } catch {
    // Missing, corrupt, or foreign file — the worst case is re-reading
    // transcripts on the next search, which is exactly the pre-cache behaviour.
  }
}

function parseThreadIndex(value: unknown): ThreadIndex | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const record = value as { mtimeMs?: unknown; sizeBytes?: unknown; entries?: unknown }
  if (typeof record.mtimeMs !== 'number' || typeof record.sizeBytes !== 'number') {
    return null
  }
  if (!Array.isArray(record.entries)) {
    return null
  }
  const entries: ChatSearchEntry[] = []
  for (const item of record.entries) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const entry = item as { source?: unknown; text?: unknown }
    if (typeof entry.text !== 'string') {
      continue
    }
    entries.push({
      source: entry.source === 'user' ? 'user' : 'assistant',
      text: entry.text
    })
  }
  return { mtimeMs: record.mtimeMs, sizeBytes: record.sizeBytes, entries }
}

function scheduleSave(): void {
  if (filePath === null) {
    return
  }
  const path = filePath
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    saveTimer = null
    // Chained so a slow write and a rescheduled save cannot rename out of order.
    lastSave = lastSave.then(() => persist(path))
  }, SAVE_DEBOUNCE_MS)
  // A pending save must not keep a quitting process alive.
  if (typeof saveTimer.unref === 'function') {
    saveTimer.unref()
  }
}

export async function flushChatThreadSearchIndexForTests(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    if (filePath !== null) {
      const path = filePath
      lastSave = lastSave.then(() => persist(path))
    }
  }
  await lastSave
}

async function persist(path: string): Promise<void> {
  const directory = dirname(path)
  const tempPath = join(directory, `chat-search-index-${process.pid}-${Date.now()}.tmp`)
  try {
    const payload = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      threads: Object.fromEntries(index)
    })
    await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
    await writeFile(tempPath, payload, { mode: PRIVATE_FILE_MODE })
    await rename(tempPath, path)
  } catch (err) {
    // Runs from a timer, so every error must be swallowed here or it becomes an
    // unhandled rejection.
    await rm(tempPath, { force: true }).catch(() => {})
    console.debug('[chat-mode] search index save failed', err)
  }
}
