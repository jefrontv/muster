// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearNativeChatDraftCacheForTests,
  pruneNativeChatPersistedDrafts,
  readNativeChatDraftCache,
  writeNativeChatDraftCache
} from './native-chat-draft-cache'
import { NATIVE_CHAT_COMPOSER_SCOPE_CACHE_MAX } from './native-chat-composer-scope-cache'

afterEach(() => {
  clearNativeChatDraftCacheForTests()
})

describe('native-chat draft cache', () => {
  it('returns an empty string for an unknown scope', () => {
    expect(readNativeChatDraftCache('pty-1')).toBe('')
  })

  it('round-trips a draft per scope key', () => {
    writeNativeChatDraftCache('pty-1', 'hello')
    writeNativeChatDraftCache('pty-2', 'world')
    expect(readNativeChatDraftCache('pty-1')).toBe('hello')
    expect(readNativeChatDraftCache('pty-2')).toBe('world')
  })

  it('drops the entry when the draft is cleared so stale text never resurfaces', () => {
    writeNativeChatDraftCache('pty-1', 'hello')
    writeNativeChatDraftCache('pty-1', '')
    expect(readNativeChatDraftCache('pty-1')).toBe('')
  })

  it('bounds the cache so unsent drafts for removed panes cannot accumulate', () => {
    writeNativeChatDraftCache('keep', 'hot')

    const total = NATIVE_CHAT_COMPOSER_SCOPE_CACHE_MAX + 40
    for (let i = 0; i < total; i += 1) {
      writeNativeChatDraftCache(`scope-${i}`, `draft-${i}`)
      if (i % 20 === 0) {
        writeNativeChatDraftCache('keep', 'hot')
      }
    }

    // Oldest untouched draft evicted; the actively-edited and most-recent survive.
    expect(readNativeChatDraftCache('scope-0')).toBe('')
    expect(readNativeChatDraftCache('keep')).toBe('hot')
    expect(readNativeChatDraftCache(`scope-${total - 1}`)).toBe(`draft-${total - 1}`)
  })
})

const STORAGE_KEY = 'muster:native-chat-drafts:v1'
const THREAD_SCOPE = 'chat-thread:t1'

describe('chat-thread draft persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    clearNativeChatDraftCacheForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
  })

  function flush(): void {
    vi.advanceTimersByTime(500)
  }

  it('writes a thread-scoped draft through to storage', () => {
    writeNativeChatDraftCache(THREAD_SCOPE, 'half a sentence')
    flush()
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) as string)).toEqual({
      [THREAD_SCOPE]: 'half a sentence'
    })
  })

  it('restores a draft after the module cache is lost', () => {
    writeNativeChatDraftCache(THREAD_SCOPE, 'survives a reload')
    flush()
    // Simulates a renderer reload: memory gone, storage intact.
    clearNativeChatDraftCacheForTests()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ [THREAD_SCOPE]: 'survives a reload' }))

    expect(readNativeChatDraftCache(THREAD_SCOPE)).toBe('survives a reload')
  })

  it('leaves pane-scoped drafts out of storage', () => {
    // Code-mode pane keys die with the pane; persisting them would strand
    // entries nothing can ever match again.
    writeNativeChatDraftCache('pty-9', 'ephemeral')
    flush()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears storage when the draft is emptied', () => {
    writeNativeChatDraftCache(THREAD_SCOPE, 'typed')
    flush()
    writeNativeChatDraftCache(THREAD_SCOPE, '')
    flush()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('coalesces a burst of keystrokes into one write', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem')
    for (const text of ['a', 'ab', 'abc', 'abcd']) {
      writeNativeChatDraftCache(THREAD_SCOPE, text)
    }
    expect(setItem).not.toHaveBeenCalled()
    flush()
    expect(setItem).toHaveBeenCalledTimes(1)
    setItem.mockRestore()
  })

  it('prunes drafts whose thread is gone', () => {
    writeNativeChatDraftCache('chat-thread:alive', 'keep')
    writeNativeChatDraftCache('chat-thread:deleted', 'drop')
    flush()

    pruneNativeChatPersistedDrafts(['alive'])
    flush()

    expect(readNativeChatDraftCache('chat-thread:alive')).toBe('keep')
    expect(readNativeChatDraftCache('chat-thread:deleted')).toBe('')
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) as string)).toEqual({
      'chat-thread:alive': 'keep'
    })
  })

  it('survives unreadable storage rather than breaking the composer', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json')
    clearNativeChatDraftCacheForTests()
    window.localStorage.setItem(STORAGE_KEY, 'not json')

    expect(readNativeChatDraftCache(THREAD_SCOPE)).toBe('')
  })
})

