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
 * Caps the guest to an emulated CSS width and centres it in whatever pane space is left over.
 *
 * Why: CDP's metrics override changes what the PAGE believes its viewport is, but the guest element
 * still spans the pane — so a 375px emulation renders hard against the left edge with the page's own
 * background flooding the rest. Capping the element and letting auto margins absorb the slack centres
 * the frame, and does so only when slack exists: with no room the guest just fills the pane. Margins
 * are measured against the guest's siblings, so a docked devtools panel narrows the space the frame
 * centres within instead of pushing it off-centre.
 */
export function applyBrowserPageEmulatedWidth(
  webview: Electron.WebviewTag,
  cssWidthPx: number | null
): void {
  webview.style.maxWidth = cssWidthPx === null ? '' : `${cssWidthPx}px`
  webview.style.marginInline = cssWidthPx === null ? '' : 'auto'
}
