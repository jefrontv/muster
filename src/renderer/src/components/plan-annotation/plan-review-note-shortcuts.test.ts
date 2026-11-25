import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/react'
import type React from 'react'
import { forwardNoteShortcut } from './plan-review-note-shortcuts'

function keyEvent(key: string, target: unknown = null, extra: Partial<KeyboardEvent> = {}) {
  const event = {
    key,
    metaKey: true,
    ctrlKey: true,
    shiftKey: false,
    altKey: false,
    target,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extra
  }
  return event as unknown as React.KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>
  }
}

function fakeEditor(handled: boolean) {
  const handle = vi.fn(() => handled)
  const view = { someProp: (_name: string, fn: (h: typeof handle) => boolean) => fn(handle) }
  return { editor: { isDestroyed: false, view } as unknown as Editor, handle }
}

afterEach(() => vi.unstubAllGlobals())

describe('forwardNoteShortcut', () => {
  it('copies the passage when nothing in the note is selected', () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { userAgent: 'Mac', clipboard: { writeText } })
    const event = keyEvent('c')
    forwardNoteShortcut(event, fakeEditor(false).editor, 'Ship it')
    expect(writeText).toHaveBeenCalledWith('Ship it')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('hands formatting keys to the editor but keeps paste and submit in the note', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mac', clipboard: { writeText: vi.fn() } })
    const { editor, handle } = fakeEditor(true)
    const bold = keyEvent('b')
    forwardNoteShortcut(bold, editor, 'Ship it')
    expect(handle).toHaveBeenCalledTimes(1)
    expect(bold.preventDefault).toHaveBeenCalled()
    forwardNoteShortcut(keyEvent('v'), editor, 'Ship it')
    forwardNoteShortcut(keyEvent('Enter'), editor, 'Ship it')
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it('ignores keys without the platform modifier', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mac', clipboard: { writeText: vi.fn() } })
    const { editor, handle } = fakeEditor(true)
    forwardNoteShortcut(keyEvent('b', null, { metaKey: false }), editor, 'Ship it')
    expect(handle).not.toHaveBeenCalled()
  })
})
