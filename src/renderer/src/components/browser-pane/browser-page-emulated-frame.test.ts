// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { applyBrowserPageEmulatedFrame } from './browser-page-webview'

const IPHONE = { width: 390, height: 844 }
const TABLET = { width: 768, height: 1024 }

function createGuest(): Electron.WebviewTag {
  const webview = document.createElement('webview') as Electron.WebviewTag
  webview.style.flex = '1'
  webview.style.width = '100%'
  webview.style.height = '100%'
  return webview
}

describe('applyBrowserPageEmulatedFrame', () => {
  it('gives the guest the device proportions rather than the pane shape', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedFrame(webview, IPHONE)

    // Why the ratio: capping width alone left every preset full-height, so a phone frame was as
    // tall as the window instead of as tall as a phone.
    expect(webview.style.aspectRatio).toBe('390 / 844')
    expect(webview.style.maxWidth).toBe('390px')
    expect(webview.style.maxHeight).toBe('844px')
  })

  it('drops the definite size, which would otherwise beat the aspect ratio', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedFrame(webview, IPHONE)

    // A definite width AND height makes the browser ignore aspect-ratio entirely.
    expect(webview.style.width).toBe('auto')
    expect(webview.style.height).toBe('auto')
  })

  it('centres in both axes, so leftover pane space splits evenly', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedFrame(webview, IPHONE)

    expect(webview.style.margin).toBe('auto')
    // Not flex-grow: a growing box would stretch past the device box it is meant to be.
    expect(webview.style.flexGrow).toBe('0')
  })

  it('restores a pane-filling guest when emulation is switched off', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedFrame(webview, IPHONE)
    applyBrowserPageEmulatedFrame(webview, null)

    // Why every property: a stale ratio or cap would pin the page at the last preset's shape after
    // returning to Responsive.
    expect(webview.style.aspectRatio).toBe('')
    expect(webview.style.maxWidth).toBe('')
    expect(webview.style.maxHeight).toBe('')
    expect(webview.style.margin).toBe('')
    expect(webview.style.width).toBe('100%')
    expect(webview.style.height).toBe('100%')
    expect(webview.style.flexGrow).toBe('1')
  })

  it('retargets to a new preset without stacking constraints', () => {
    const webview = createGuest()

    applyBrowserPageEmulatedFrame(webview, IPHONE)
    applyBrowserPageEmulatedFrame(webview, TABLET)

    expect(webview.style.aspectRatio).toBe('768 / 1024')
    expect(webview.style.maxWidth).toBe('768px')
    expect(webview.style.maxHeight).toBe('1024px')
  })
})
