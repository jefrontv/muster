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
 * Frames the guest as the device box: emulated proportions, centred, never larger than the pane.
 *
 * Why aspect-ratio rather than measured pixels: the pane's free space depends on its siblings — a
 * docked devtools panel narrows it — and on the window, so any number computed here would be stale
 * by the next resize. `max-width`/`max-height` with an aspect ratio lets flexbox solve the fit
 * every frame, and auto margins centre whatever is left over.
 *
 * Height matters as much as width: capping only the width left every preset full-height, so an
 * iPhone frame was the shape of the pane rather than the shape of a phone.
 */
export function applyBrowserPageEmulatedFrame(
  webview: Electron.WebviewTag,
  preset: { width: number; height: number } | null
): void {
  if (preset === null) {
    webview.style.maxWidth = ''
    webview.style.maxHeight = ''
    webview.style.aspectRatio = ''
    webview.style.margin = ''
    webview.style.flex = '1'
    webview.style.width = '100%'
    webview.style.height = '100%'
    return
  }
  // flex 0 auto: the box is sized by the ratio and the caps, not stretched to fill the pane.
  webview.style.flex = '0 1 auto'
  // Both must go to auto, or a definite width AND height makes the browser ignore aspect-ratio.
  webview.style.width = 'auto'
  webview.style.height = 'auto'
  webview.style.aspectRatio = `${preset.width} / ${preset.height}`
  webview.style.maxWidth = `${preset.width}px`
  webview.style.maxHeight = `${preset.height}px`
  webview.style.margin = 'auto'
}
