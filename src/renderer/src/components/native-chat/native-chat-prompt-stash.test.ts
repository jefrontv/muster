// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  appendPromptStashEntry,
  deletePromptStashEntry,
  PROMPT_STASH_MAX_ENTRIES,
  PROMPT_STASH_STORAGE_KEY,
  promptStashRelativeLabel,
  promptStashSnippet,
  readPromptStash,
  removePromptStashEntry,
  restoredPromptDraft,
  stashPrompt,
  type PromptStashEntry
} from './native-chat-prompt-stash'

function entry(id: string, createdAt = 0): PromptStashEntry {
  return { id, text: `text-${id}`, createdAt }
}

describe('appendPromptStashEntry', () => {
  it('prepends newest first', () => {
    const result = appendPromptStashEntry([entry('a')], entry('b'))
    expect(result.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('drops the oldest entry past the cap', () => {
    let entries: PromptStashEntry[] = []
    for (let i = 0; i < PROMPT_STASH_MAX_ENTRIES + 3; i += 1) {
      entries = appendPromptStashEntry(entries, entry(`e${i}`))
    }
    expect(entries).toHaveLength(PROMPT_STASH_MAX_ENTRIES)
    expect(entries[0]!.id).toBe(`e${PROMPT_STASH_MAX_ENTRIES + 2}`)
    expect(entries.at(-1)!.id).toBe('e3')
  })
})

describe('removePromptStashEntry', () => {
  it('removes only the matching id', () => {
    const result = removePromptStashEntry([entry('a'), entry('b')], 'a')
    expect(result.map((e) => e.id)).toEqual(['b'])
  })
})

describe('restoredPromptDraft', () => {
  it('replaces an empty draft', () => {
    expect(restoredPromptDraft('', 'stashed')).toBe('stashed')
    expect(restoredPromptDraft('   ', 'stashed')).toBe('stashed')
  })

  it('appends with a blank line to a non-empty draft', () => {
    expect(restoredPromptDraft('current', 'stashed')).toBe('current\n\nstashed')
  })
})

describe('promptStashSnippet', () => {
  it('collapses whitespace and truncates at 90 chars', () => {
    expect(promptStashSnippet('a\n  b\tc')).toBe('a b c')
    const long = 'x'.repeat(200)
    expect(promptStashSnippet(long)).toHaveLength(91)
    expect(promptStashSnippet(long).endsWith('…')).toBe(true)
  })

  it('labels an all-whitespace text', () => {
    expect(promptStashSnippet('  \n ')).toBe('(empty)')
  })
})

describe('promptStashRelativeLabel', () => {
  it('buckets by minutes, hours, days', () => {
    const now = 100 * 24 * 3_600_000
    expect(promptStashRelativeLabel(now - 5_000, now)).toBe('now')
    expect(promptStashRelativeLabel(now - 5 * 60_000, now)).toBe('5m')
    expect(promptStashRelativeLabel(now - 3 * 3_600_000, now)).toBe('3h')
    expect(promptStashRelativeLabel(now - 49 * 3_600_000, now)).toBe('2d')
  })
})

describe('localStorage round trip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stashes, reads back, and deletes', () => {
    stashPrompt('first', 1)
    const entries = stashPrompt('second', 2)
    expect(entries.map((e) => e.text)).toEqual(['second', 'first'])
    expect(readPromptStash().map((e) => e.text)).toEqual(['second', 'first'])
    const remaining = deletePromptStashEntry(entries[1]!.id)
    expect(remaining.map((e) => e.text)).toEqual(['second'])
    expect(readPromptStash().map((e) => e.text)).toEqual(['second'])
  })

  it('reads malformed storage as empty', () => {
    localStorage.setItem(PROMPT_STASH_STORAGE_KEY, '{not json')
    expect(readPromptStash()).toEqual([])
    localStorage.setItem(PROMPT_STASH_STORAGE_KEY, JSON.stringify([{ id: 1 }, entry('ok')]))
    expect(readPromptStash().map((e) => e.id)).toEqual(['ok'])
  })
})
