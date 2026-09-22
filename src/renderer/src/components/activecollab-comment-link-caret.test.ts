// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { caretInsideLink } from './activecollab-comment-link-caret'
import { createActiveCollabCommentExtensions } from './activecollab-comment-editor-schema'

function editor(content: string): Editor {
  return new Editor({
    element: null,
    extensions: createActiveCollabCommentExtensions('placeholder'),
    content
  })
}

const LINKED = '<p>see <a href="https://example.test/x">https://example.test/x</a> ok</p>'

/** Character offsets are 1-based inside the paragraph, matching ProseMirror positions. */
function caretAt(content: string, pos: number): boolean {
  const instance = editor(content)
  instance.commands.setTextSelection(pos)
  return caretInsideLink(instance.state)
}

describe('caretInsideLink', () => {
  it('is true with the caret in the middle of the link text', () => {
    // "see " is 4 characters, so the link runs from 5; land well inside it.
    expect(caretAt(LINKED, 12)).toBe(true)
  })

  it('is false at the trailing edge of a link', () => {
    // The paste case. `isActive('link')` answers true here, which is the whole problem.
    const instance = editor('<p><a href="https://example.test/x">https://example.test/x</a></p>')
    instance.commands.focus('end')
    expect(caretInsideLink(instance.state)).toBe(false)
  })

  it('is false at the leading edge of a link', () => {
    expect(caretAt('<p><a href="https://example.test/x">abc</a> tail</p>', 1)).toBe(false)
  })

  it('is false in plain text beside a link', () => {
    expect(caretAt(LINKED, 2)).toBe(false)
  })

  it('is false in an empty document', () => {
    const instance = editor('<p></p>')
    expect(caretInsideLink(instance.state)).toBe(false)
  })

  it('is false for a range selection across the link', () => {
    const instance = editor(LINKED)
    instance.commands.setTextSelection({ from: 6, to: 14 })
    expect(caretInsideLink(instance.state)).toBe(false)
  })

  it('is false for a document with no link at all', () => {
    expect(caretAt('<p>plain words here</p>', 4)).toBe(false)
  })
})
