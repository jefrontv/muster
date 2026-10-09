// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_HISTORY } from './native-chat-composer-state'
import { useNativeChatComposerKeyDown } from './use-native-chat-composer-keydown'

const platform = vi.hoisted(() => ({ value: 'darwin' as 'darwin' | 'linux' }))
vi.mock('@/lib/shortcut-platform', () => ({ getShortcutPlatform: () => platform.value }))

function press(modifiers: { metaKey?: boolean; ctrlKey?: boolean }) {
  const send = vi.fn()
  const { result } = renderHook(() =>
    useNativeChatComposerKeyDown({
      autocomplete: { mode: 'none' } as never,
      activeSuggestion: 0,
      draft: 'use tabs',
      history: EMPTY_HISTORY,
      isComposing: () => false,
      completePickerItem: vi.fn(),
      dispatchPickerCommand: vi.fn(),
      dismissPicker: vi.fn(),
      interrupt: vi.fn(),
      send,
      setActiveSuggestion: vi.fn(),
      setDraft: vi.fn(),
      setCaret: vi.fn(),
      setHistory: vi.fn()
    })
  )
  result.current({
    key: 'Enter',
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    keyCode: 13,
    ...modifiers,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent<HTMLTextAreaElement>)
  return send
}

describe('composer Enter while the agent works', () => {
  it('queues on plain Enter', () => {
    platform.value = 'darwin'
    expect(press({})).toHaveBeenCalledWith({ steer: false })
  })

  it('steers on Cmd+Enter on Mac and Ctrl+Enter elsewhere', () => {
    platform.value = 'darwin'
    expect(press({ metaKey: true })).toHaveBeenCalledWith({ steer: true })
    expect(press({ ctrlKey: true })).toHaveBeenCalledWith({ steer: false })
    platform.value = 'linux'
    expect(press({ ctrlKey: true })).toHaveBeenCalledWith({ steer: true })
  })
})
