// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { documentHasOpenDialog, resolveTaskPageEscapeTarget } from './task-page-escape-target'

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
