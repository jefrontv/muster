import { describe, expect, it } from 'vitest'
import { resolveSourceControlTreeKeyCommand } from './source-control-tree-key-commands'

function key(name: string, modifiers: Partial<KeyboardEvent> = {}) {
  return { key: name, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers }
}

describe('resolveSourceControlTreeKeyCommand', () => {
  it('maps tree keys to commands', () => {
    expect(resolveSourceControlTreeKeyCommand(key('ArrowDown'), false)).toEqual({
      type: 'navigate',
      command: 'next'
    })
    expect(resolveSourceControlTreeKeyCommand(key('Enter'), false)).toEqual({ type: 'open' })
    expect(resolveSourceControlTreeKeyCommand(key(' '), false)).toEqual({ type: 'toggle-index' })
    expect(resolveSourceControlTreeKeyCommand(key('Delete'), false)).toEqual({ type: 'discard' })
  })

  it('treats Backspace as discard only on Mac', () => {
    expect(resolveSourceControlTreeKeyCommand(key('Backspace'), true)).toEqual({ type: 'discard' })
    expect(resolveSourceControlTreeKeyCommand(key('Backspace'), false)).toBeNull()
  })

  it('opens the context menu from Shift+F10 or the ContextMenu key', () => {
    expect(resolveSourceControlTreeKeyCommand(key('F10', { shiftKey: true }), false)).toEqual({
      type: 'context-menu'
    })
    expect(resolveSourceControlTreeKeyCommand(key('ContextMenu'), true)).toEqual({
      type: 'context-menu'
    })
    expect(resolveSourceControlTreeKeyCommand(key('F10'), false)).toBeNull()
  })

  it('leaves modified keys to app shortcuts', () => {
    expect(resolveSourceControlTreeKeyCommand(key('Enter', { metaKey: true }), true)).toBeNull()
    expect(resolveSourceControlTreeKeyCommand(key('Enter', { ctrlKey: true }), false)).toBeNull()
    expect(
      resolveSourceControlTreeKeyCommand(key('ArrowDown', { shiftKey: true }), false)
    ).toBeNull()
  })
})
