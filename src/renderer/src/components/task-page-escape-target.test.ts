// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import {
  documentHasOpenDialog,
  resolveTaskPageEscapeTarget,
  shouldTaskPageEscapeBlurTextEntry
} from './task-page-escape-target'

describe('resolveTaskPageEscapeTarget', () => {
  it('lets an open dialog keep Escape for itself', () => {
    // The attachment lightbox is a Radix dialog; the page captures Escape first,
    // so it has to stand down or the whole Tasks view closes behind the image.
    expect(resolveTaskPageEscapeTarget({ hasOpenDialog: true, hasOpenTask: true })).toBe('dialog')
    expect(resolveTaskPageEscapeTarget({ hasOpenDialog: true, hasOpenTask: false })).toBe('dialog')
  })

  it('closes the open task before the page', () => {
    expect(resolveTaskPageEscapeTarget({ hasOpenDialog: false, hasOpenTask: true })).toBe(
      'open-task'
    )
  })

  it('leaves the page only once nothing is open on top of it', () => {
    expect(resolveTaskPageEscapeTarget({ hasOpenDialog: false, hasOpenTask: false })).toBe('page')
  })
})

describe('shouldTaskPageEscapeBlurTextEntry', () => {
  it('blurs a focused field when nothing is layered over the page', () => {
    expect(shouldTaskPageEscapeBlurTextEntry({ hasOpenDialog: false, isTextEntry: true })).toBe(
      true
    )
  })

  it('stands down inside a dialog, even with focus in its own input', () => {
    // The regression this exists for: a command palette autofocuses its input, so blurring first
    // consumed the keypress and left the palette undismissable.
    expect(shouldTaskPageEscapeBlurTextEntry({ hasOpenDialog: true, isTextEntry: true })).toBe(
      false
    )
  })

  it('never claims Escape when focus is not in a field', () => {
    expect(shouldTaskPageEscapeBlurTextEntry({ hasOpenDialog: false, isTextEntry: false })).toBe(
      false
    )
    expect(shouldTaskPageEscapeBlurTextEntry({ hasOpenDialog: true, isTextEntry: false })).toBe(
      false
    )
  })
})

function docWith(html: string): Document {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return doc
}

describe('documentHasOpenDialog', () => {
  it('sees an open dialog', () => {
    expect(documentHasOpenDialog(docWith('<div role="dialog" data-state="open"></div>'))).toBe(true)
  })

  it('ignores a dialog that is closing or closed', () => {
    expect(documentHasOpenDialog(docWith('<div role="dialog" data-state="closed"></div>'))).toBe(
      false
    )
  })

  it('is false on a page with no dialog at all', () => {
    expect(documentHasOpenDialog(docWith('<main></main>'))).toBe(false)
  })
})
