// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { applyBrowserPageEmulatedWidth } from './browser-page-webview'

function createGuest(): Electron.WebviewTag {
  const webview = document.createElement('webview') as Electron.WebviewTag
  webview.style.flex = '1'
  webview.style.width = '100%'
  return webview
}

describe('applyBrowserPageEmulatedWidth', () => {
  it('caps the guest and lets auto margins centre it in the leftover space', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedWidth(webview, 375)

    // Why maxWidth and not width: the frame must only centre when the pane is WIDER than the
    // emulated viewport. A fixed width would also force the guest to 375px in a narrower pane.
    expect(webview.style.maxWidth).toBe('375px')
    expect(webview.style.marginInline).toBe('auto')
    // Why: the guest still has to claim the row, or auto margins have no free space to split.
    expect(webview.style.flexGrow).toBe('1')
  })

  it('clears the cap when emulation is switched off', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedWidth(webview, 375)
    applyBrowserPageEmulatedWidth(webview, null)

    // Why: a stale cap would pin the page at the last preset's width after returning to Responsive.
    expect(webview.style.maxWidth).toBe('')
    expect(webview.style.marginInline).toBe('')
  })

  it('retargets to a new preset without stacking constraints', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedWidth(webview, 375)
    applyBrowserPageEmulatedWidth(webview, 768)

    expect(webview.style.maxWidth).toBe('768px')
  })
})
