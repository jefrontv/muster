// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storeState = vi.hoisted(() => ({
  activeTabType: 'terminal' as string,
  activeTabId: null as string | null
}))
const focusTerminalTabSurface = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => ({ useAppStore: { getState: () => storeState } }))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface }))

import { rememberFocusBeforeReview, restoreFocusAfterReview } from './plan-review-focus-return'

function openReview(): HTMLElement {
  const dialog = document.createElement('div')
  dialog.setAttribute('data-plan-review-dialog', '')
  const button = document.createElement('button')
  dialog.append(button)
  document.body.append(dialog)
  button.focus()
  return dialog
}

describe('plan review focus return', () => {
  let terminalInput: HTMLTextAreaElement

  beforeEach(() => {
    terminalInput = document.createElement('textarea')
    document.body.append(terminalInput)
    storeState.activeTabId = null
    focusTerminalTabSurface.mockReset()
  })

  afterEach(() => {
    restoreFocusAfterReview()
    document.body.replaceChildren()
  })

  it('returns focus to what was focused before the review arrived', () => {
    terminalInput.focus()
    rememberFocusBeforeReview()
    openReview().remove()

    restoreFocusAfterReview()

    expect(document.activeElement).toBe(terminalInput)
  })

  it('keeps the original target while a queued review is still showing', () => {
    terminalInput.focus()
    rememberFocusBeforeReview()
    const first = openReview()
    rememberFocusBeforeReview()
    first.remove()
    const second = openReview()

    restoreFocusAfterReview()
    expect(document.activeElement).not.toBe(terminalInput)

    second.remove()
    restoreFocusAfterReview()
    expect(document.activeElement).toBe(terminalInput)
  })

  it('replaces a target left behind by a review that never showed', () => {
    const composer = document.createElement('textarea')
    document.body.append(composer)
    terminalInput.focus()
    rememberFocusBeforeReview()
    composer.focus()
    rememberFocusBeforeReview()
    openReview().remove()

    restoreFocusAfterReview()

    expect(document.activeElement).toBe(composer)
  })

  it('falls back to the active terminal when nothing was focused', () => {
    storeState.activeTabId = 'tab-1'
    rememberFocusBeforeReview()
    openReview().remove()

    restoreFocusAfterReview()

    expect(focusTerminalTabSurface).toHaveBeenCalledWith('tab-1', null, {
      onlyIfFocusUnclaimed: true
    })
  })

  it('falls back when the remembered element has left the page', () => {
    storeState.activeTabId = 'tab-2'
    terminalInput.focus()
    rememberFocusBeforeReview()
    terminalInput.remove()

    restoreFocusAfterReview()

    expect(focusTerminalTabSurface).toHaveBeenCalledWith('tab-2', null, {
      onlyIfFocusUnclaimed: true
    })
  })
})
