// localStorage-backed prompt stash (⌘S/Ctrl+S): a small global queue of drafts,
// shared across threads and both chat surfaces. Newest first, capped, oldest dropped.

export type PromptStashEntry = {
  id: string
  text: string
  createdAt: number
}

export const PROMPT_STASH_STORAGE_KEY = 'muster:prompt-stash:v1'
export const PROMPT_STASH_MAX_ENTRIES = 20
const SNIPPET_MAX_CHARS = 90

/** Prepend an entry; past the cap the oldest (tail) entries drop. */
export function appendPromptStashEntry(
  entries: readonly PromptStashEntry[],
  entry: PromptStashEntry
): PromptStashEntry[] {
  return [entry, ...entries].slice(0, PROMPT_STASH_MAX_ENTRIES)
}

export function removePromptStashEntry(
  entries: readonly PromptStashEntry[],
  id: string
): PromptStashEntry[] {
  return entries.filter((entry) => entry.id !== id)
}

/** Restoring appends to a non-empty draft instead of clobbering it. */
export function restoredPromptDraft(currentDraft: string, stashedText: string): string {
  return currentDraft.trim() === '' ? stashedText : `${currentDraft}\n\n${stashedText}`
}

export function promptStashSnippet(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, ' ')
  if (collapsed === '') {
    return '(empty)'
  }
  return collapsed.length > SNIPPET_MAX_CHARS
    ? `${collapsed.slice(0, SNIPPET_MAX_CHARS)}…`
    : collapsed
}

/** Coarse relative age for menu rows ("now", "5m", "3h", "2d"). */
export function promptStashRelativeLabel(createdAt: number, now: number): string {
  const elapsedMs = Math.max(0, now - createdAt)
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 1) {
    return 'now'
  }
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}

function isPromptStashEntry(value: unknown): value is PromptStashEntry {
  const entry = value as PromptStashEntry | null
  return (
    typeof entry?.id === 'string' &&
    typeof entry.text === 'string' &&
    typeof entry.createdAt === 'number'
  )
}

/** Read the persisted queue; malformed or blocked storage reads as empty. */
export function readPromptStash(): PromptStashEntry[] {
  try {
    const raw = localStorage.getItem(PROMPT_STASH_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(isPromptStashEntry).slice(0, PROMPT_STASH_MAX_ENTRIES)
      : []
  } catch {
    return []
  }
}

/** Best-effort persist; a quota/policy failure keeps the in-memory list usable. */
export function writePromptStash(entries: readonly PromptStashEntry[]): void {
  try {
    localStorage.setItem(PROMPT_STASH_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Quota or blocked storage: the session keeps its in-memory entries.
  }
}

/** Stash a draft: read-modify-write so concurrent surfaces don't clobber each other. */
export function stashPrompt(text: string, now = Date.now()): PromptStashEntry[] {
  const entry: PromptStashEntry = {
    id: `stash-${now}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    createdAt: now
  }
  const entries = appendPromptStashEntry(readPromptStash(), entry)
  writePromptStash(entries)
  return entries
}

export function deletePromptStashEntry(id: string): PromptStashEntry[] {
  const entries = removePromptStashEntry(readPromptStash(), id)
  writePromptStash(entries)
  return entries
}
