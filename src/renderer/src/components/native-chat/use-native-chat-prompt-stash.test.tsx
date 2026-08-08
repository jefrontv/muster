// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeChatPromptStash } from './use-native-chat-prompt-stash'

const PROMPT_STASH_STORAGE_KEY = 'muster:prompt-stash:v1'

function renderStash(draft: string): {
  result: { current: ReturnType<typeof useNativeChatPromptStash> }
  setDraft: ReturnType<typeof vi.fn>
} {
  const setDraft = vi.fn()
  const setCaret = vi.fn()
  const textareaRef = { current: null }
  const { result } = renderHook(() =>
    useNativeChatPromptStash({ draft, setDraft, setCaret, textareaRef })
  )
  return { result, setDraft }
}

describe('useNativeChatPromptStash stashCurrent', () => {
  beforeEach(() => localStorage.removeItem(PROMPT_STASH_STORAGE_KEY))

  it('stashes the draft, clears the composer, and persists', () => {
    const { result, setDraft } = renderStash('park this prompt')
    expect(result.current.hasDraft).toBe(true)
    act(() => result.current.stashCurrent())
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0]?.text).toBe('park this prompt')
    expect(setDraft).toHaveBeenCalledWith('')
    expect(JSON.parse(localStorage.getItem(PROMPT_STASH_STORAGE_KEY) ?? '[]')).toHaveLength(1)
  })

  it('ignores an empty draft', () => {
    const { result } = renderStash('   ')
    expect(result.current.hasDraft).toBe(false)
    act(() => result.current.stashCurrent())
    expect(result.current.entries).toHaveLength(0)
  })
})
