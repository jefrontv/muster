// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Deterministic paste stand-in: replaces the element's current selection, the
// same contract the real execCommand-backed helper fulfils.
vi.mock('@/lib/text-control-paste', () => ({
  pasteTextIntoTextControl: vi.fn(
    async (element: HTMLTextAreaElement, text: string): Promise<void> => {
      const start = element.selectionStart ?? 0
      const end = element.selectionEnd ?? start
      element.setRangeText(text, start, end, 'end')
    }
  )
}))

import { createDictationLiveInserter } from './dictation-live-insert'

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function makeTextarea(value = ''): HTMLTextAreaElement {
  const element = document.createElement('textarea')
  element.value = value
  document.body.appendChild(element)
  element.focus()
  element.setSelectionRange(value.length, value.length)
  return element
}

describe('createDictationLiveInserter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('rewrites the live segment as partials revise', async () => {
    const element = makeTextarea('note: ')
    const inserter = createDictationLiveInserter(element)
    inserter.applyPartial('hell')
    await settle()
    expect(element.value).toBe('note: hell')
    inserter.applyPartial('hello world')
    await settle()
    expect(element.value).toBe('note: hello world')
  })

  it('final collapses the segment so the next utterance appends', async () => {
    const element = makeTextarea('')
    const inserter = createDictationLiveInserter(element)
    inserter.applyPartial('first bit')
    await settle()
    inserter.applyFinal('First bit.')
    await settle()
    expect(element.value).toBe('First bit.')
    inserter.applyPartial('second')
    await settle()
    expect(element.value).toBe('First bit.second')
    expect(inserter.isAbandoned()).toBe(false)
  })

  it('abandons when the user edits inside the live segment', async () => {
    const element = makeTextarea('')
    const inserter = createDictationLiveInserter(element)
    inserter.applyPartial('draft words')
    await settle()
    element.value = 'user typed over everything'
    inserter.applyPartial('draft words extended')
    await settle()
    expect(inserter.isAbandoned()).toBe(true)
    expect(element.value).toBe('user typed over everything')
  })

  it('abandons when the element loses focus', async () => {
    const element = makeTextarea('')
    const inserter = createDictationLiveInserter(element)
    element.blur()
    inserter.applyPartial('unheard')
    await settle()
    expect(inserter.isAbandoned()).toBe(true)
    expect(element.value).toBe('')
  })
})
