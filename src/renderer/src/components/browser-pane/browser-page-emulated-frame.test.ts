// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { applyBrowserPageEmulatedFrame } from './browser-page-webview'

const LAPTOP_L = { width: 1440, height: 900 }
const IPHONE = { width: 390, height: 844 }

/**
 * A guest in a pane of a known size.
 *
 * happy-dom reports 0 for every layout box, so clientWidth/clientHeight and any sibling's
 * offsetWidth are defined here — the fit is arithmetic on those numbers, which is the part worth
 * testing.
 */
function mount(paneWidth: number, paneHeight: number, siblingWidth = 0): Electron.WebviewTag {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: paneWidth, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: paneHeight, configurable: true })

  if (siblingWidth > 0) {
    const dock = document.createElement('div')
    Object.defineProperty(dock, 'offsetWidth', { value: siblingWidth, configurable: true })
    container.appendChild(dock)
  }

  const webview = document.createElement('webview') as Electron.WebviewTag
  webview.style.flex = '1'
  webview.style.width = '100%'
  webview.style.height = '100%'
  container.appendChild(webview)
  document.body.appendChild(container)
  return webview
}

describe('applyBrowserPageEmulatedFrame', () => {
  it('fills the pane at the device ratio rather than collapsing to the element intrinsic size', () => {
    // Why this is the regression: a <webview> is a replaced element about 300x150 intrinsically, so
    // sizing it with `width: auto` rendered a 1440x900 preset as a thumbnail in the middle of the
    // pane. The box has to be stated in pixels.
    const webview = mount(1280, 780)

    applyBrowserPageEmulatedFrame(webview, LAPTOP_L)

    // Height is the binding constraint: 780/900 = 0.8667 beats 1280/1440 = 0.8889.
    const scale = 780 / 900
    expect(webview.style.width).toBe(`${Math.round(1440 * scale)}px`)
    expect(webview.style.height).toBe('780px')
    // Neither grow nor shrink: the box is exactly what was measured.
    expect(webview.style.flexGrow).toBe('0')
    expect(webview.style.flexShrink).toBe('0')
  })

  it('keeps the device aspect ratio, whichever axis binds', () => {
    const webview = mount(1280, 780)

    applyBrowserPageEmulatedFrame(webview, IPHONE)

    // A tall phone in a short pane binds on height.
    const scale = 780 / 844
    expect(webview.style.height).toBe('780px')
    expect(webview.style.width).toBe(`${Math.round(390 * scale)}px`)
  })

  it('shows a device smaller than the pane at life size', () => {
    const webview = mount(2000, 1400)

    applyBrowserPageEmulatedFrame(webview, IPHONE)

    // Clamped at 1: blowing a 390px phone up to fill a 2000px pane would be a lie about the preview.
    expect(webview.style.width).toBe('390px')
    expect(webview.style.height).toBe('844px')
  })

  it('fits into the space a docked devtools panel leaves, not the whole pane', () => {
    const webview = mount(1280, 780, 480)

    applyBrowserPageEmulatedFrame(webview, LAPTOP_L)

    // 800 usable width against 1440 is now the binding constraint, not the height.
    const scale = 800 / 1440
    expect(webview.style.width).toBe('800px')
    expect(webview.style.height).toBe(`${Math.round(900 * scale)}px`)
  })

  it('centres the frame in the leftover space', () => {
    const webview = mount(2000, 1400)

    applyBrowserPageEmulatedFrame(webview, IPHONE)

    expect(webview.style.margin).toBe('auto')
  })

  it('leaves the guest alone before layout has settled', () => {
    const webview = mount(0, 0)

    applyBrowserPageEmulatedFrame(webview, IPHONE)

    // Why: a zero-sized pane would compute a zero-sized frame and the observer would never see a
    // change to correct it. Keeping the pane-filling default is the recoverable state.
    expect(webview.style.width).toBe('100%')
    expect(webview.style.height).toBe('100%')
  })

  it('restores a pane-filling guest when emulation is switched off', () => {
    const webview = mount(1280, 780)

    applyBrowserPageEmulatedFrame(webview, IPHONE)
    applyBrowserPageEmulatedFrame(webview, null)

    expect(webview.style.width).toBe('100%')
    expect(webview.style.height).toBe('100%')
    expect(webview.style.margin).toBe('')
    expect(webview.style.flexGrow).toBe('1')
  })

  it('retargets to a new preset without keeping the old box', () => {
    const webview = mount(1280, 780)

    applyBrowserPageEmulatedFrame(webview, IPHONE)
    applyBrowserPageEmulatedFrame(webview, LAPTOP_L)

    expect(webview.style.width).toBe(`${Math.round(1440 * (780 / 900))}px`)
  })
})
