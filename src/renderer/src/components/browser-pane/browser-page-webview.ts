import { ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '../../../../shared/browser-guest-web-preferences'
import {
  destroyPersistentWebview,
  registerPersistentWebview,
  webviewRegistry
} from './webview-registry'

export function ensureBrowserPageWebview({
  browserTabId,
  container,
  inputLocked,
  webviewPartition,
  resolveContainer
}: {
  browserTabId: string
  container: HTMLDivElement
  inputLocked: boolean
  webviewPartition: string
  resolveContainer: () => HTMLDivElement | null
}): { container: HTMLDivElement; created: boolean; webview: Electron.WebviewTag } | null {
  let webview = webviewRegistry.get(browserTabId)
  let created = false
  let activeContainer = container

  // Why: a persisted guest must be torn down and rebuilt when its DOM parent
  // drifted (moving a <webview> across parents can recreate the guest document)
  // or when its partition no longer matches — Electron partitions are immutable
  // after creation, so reuse would keep the stale session. Re-resolve the
  // viewport container the teardown may have detached; bail if it is gone.
  if (
    webview &&
    (webview.parentElement !== container || webview.getAttribute('partition') !== webviewPartition)
  ) {
    destroyPersistentWebview(browserTabId)
    webview = undefined
    const refreshedContainer = resolveContainer()
    if (!refreshedContainer) {
      return null
    }
    activeContainer = refreshedContainer
  }
  if (webview) {
    webview.style.pointerEvents = inputLocked ? 'none' : 'auto'
    return { container: activeContainer, created, webview }
  }

  webview = document.createElement('webview') as Electron.WebviewTag
  webview.setAttribute('partition', webviewPartition)
  webview.setAttribute('allowpopups', '')
  // Why: Electron spreads the webpreferences keys verbatim, so the shared
  // camelCase attribute must stay intact for fullscreen containment to work.
  webview.setAttribute('webpreferences', ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
  webview.style.display = 'flex'
  webview.style.flex = '1'
  webview.style.width = '100%'
  webview.style.height = '100%'
  webview.style.border = 'none'
  webview.style.pointerEvents = inputLocked ? 'none' : 'auto'
  // Why: some pages never paint a background, and a white viewport matches
  // normal browser behavior instead of leaking Orca chrome through the guest.
  webview.style.background = '#ffffff'
  registerPersistentWebview(browserTabId, webview)
  activeContainer.appendChild(webview)
  created = true

  return { container: activeContainer, created, webview }
}

/**
 * Free space in the guest's row, in CSS pixels.
 *
 * Siblings that take part in layout — a docked devtools panel — are subtracted, so the frame
 * centres in what is actually left rather than in the whole pane. Absolutely positioned overlays
 * (the failure banner, the focus catcher) take no space and are skipped.
 */
function readAvailableBox(webview: Electron.WebviewTag): { width: number; height: number } {
  const parent = webview.parentElement
  if (!parent) {
    return { width: 0, height: 0 }
  }
  let taken = 0
  for (const sibling of parent.children) {
    if (sibling === webview || !(sibling instanceof HTMLElement)) {
      continue
    }
    const position = getComputedStyle(sibling).position
    if (position === 'absolute' || position === 'fixed') {
      continue
    }
    taken += sibling.offsetWidth
  }
  return {
    width: Math.max(0, parent.clientWidth - taken),
    height: Math.max(0, parent.clientHeight)
  }
}

/**
 * Frames the guest as the device box: real device proportions, scaled down to fit, centred.
 *
 * Why measured pixels rather than aspect-ratio and caps: a `<webview>` is a replaced element with a
 * small intrinsic size, so `width: auto` collapses the box to roughly 300x150 instead of growing
 * into the pane — a 1440x900 preset rendered as a thumbnail. Explicit numbers cannot be
 * misinterpreted, and the caller re-runs this on resize.
 *
 * The scale is deliberately NOT sent to main: main reads the guest's real surface, so whatever box
 * is set here is what it measures, and the two cannot drift.
 */
export function applyBrowserPageEmulatedFrame(
  webview: Electron.WebviewTag,
  preset: { width: number; height: number } | null
): void {
  if (preset === null) {
    webview.style.margin = ''
    webview.style.flex = '1'
    webview.style.width = '100%'
    webview.style.height = '100%'
    return
  }
  const available = readAvailableBox(webview)
  // Before layout has settled there is nothing to fit into; the resize observer runs this again.
  if (available.width <= 0 || available.height <= 0) {
    return
  }
  // Clamped at 1: a device smaller than the pane is shown life size, not blown up.
  const scale = Math.min(1, available.width / preset.width, available.height / preset.height)
  webview.style.flex = '0 0 auto'
  webview.style.width = `${Math.round(preset.width * scale)}px`
  webview.style.height = `${Math.round(preset.height * scale)}px`
  webview.style.margin = 'auto'
}
