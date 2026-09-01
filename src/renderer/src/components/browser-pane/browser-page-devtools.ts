// Devtools docked beside the page guest, inside that page's viewport container.
//
// Why a second <webview>: a guest's devtools cannot dock via `openDevTools({ mode })` — docking is
// relative to a window's own contents and a guest is not one, so every mode lands in a detached
// window. Main instead renders devtools INTO a WebContents we own, which lets us size and place it.
// That host is single-use (Electron binds it to one devtools session), so each open builds a fresh
// one rather than reviving the last.

import { getBrowserPageViewportContainer } from './browser-page-viewport'

const DEFAULT_DOCK_WIDTH_PX = 480
const MIN_DOCK_WIDTH_PX = 260
// Why: the page must keep some width while dragging, or the divider can be pushed past the
// container edge with no handle left to drag back.
const MIN_PAGE_WIDTH_PX = 220
const ATTACH_TIMEOUT_MS = 5_000

type DockedDevTools = {
  wrapper: HTMLDivElement
  webview: Electron.WebviewTag
  release: () => void
}

const dockedByPageId = new Map<string, DockedDevTools>()

// Shared across tabs, like Chrome's dock width: resize one, open another, they agree.
let dockWidthPx = DEFAULT_DOCK_WIDTH_PX

function clampDockWidth(requestedPx: number, containerWidthPx: number): number {
  const maxWidthPx = Math.max(MIN_DOCK_WIDTH_PX, containerWidthPx - MIN_PAGE_WIDTH_PX)
  return Math.min(Math.max(requestedPx, MIN_DOCK_WIDTH_PX), maxWidthPx)
}

/** Resolves once the guest is attached and can report its id, or null if it never attaches. */
function whenWebviewAttached(webview: Electron.WebviewTag): Promise<number | null> {
  const readId = (): number | null => {
    try {
      return webview.getWebContentsId()
    } catch {
      // Why: the id only exists post-attach, so this throw is the "not yet" signal, not a failure.
      return null
    }
  }

  const attachedId = readId()
  if (attachedId !== null) {
    return Promise.resolve(attachedId)
  }

  return new Promise((resolve) => {
    const deadline = Date.now() + ATTACH_TIMEOUT_MS
    let timer: number | null = null

    // Why poll rather than read inside `did-attach`: the event fires marginally before the element
    // will hand out an id, so reading it there still throws. Measured on Electron 43.
    const poll = (): void => {
      const id = readId()
      if (id !== null) {
        resolve(id)
        return
      }
      if (Date.now() >= deadline) {
        // Why: a guest that never attaches would leave the caller awaiting forever, holding an
        // invisible host webview in the DOM.
        resolve(null)
        return
      }
      timer = window.setTimeout(poll, 50)
    }

    webview.addEventListener('did-attach', () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      poll()
    })
    poll()
  })
}

function createDivider(
  wrapper: HTMLDivElement,
  container: HTMLDivElement
): { element: HTMLDivElement; release: () => void } {
  const divider = document.createElement('div')
  divider.dataset.browserPageDevtoolsDivider = ''
  divider.className = 'w-1 shrink-0 cursor-col-resize bg-border hover:bg-ring'
  divider.setAttribute('role', 'separator')
  divider.setAttribute('aria-orientation', 'vertical')

  const onPointerMove = (event: PointerEvent): void => {
    const bounds = container.getBoundingClientRect()
    dockWidthPx = clampDockWidth(bounds.right - event.clientX, bounds.width)
    wrapper.style.width = `${dockWidthPx}px`
  }

  const endDrag = (event: PointerEvent): void => {
    divider.releasePointerCapture(event.pointerId)
    divider.removeEventListener('pointermove', onPointerMove)
    divider.removeEventListener('pointerup', endDrag)
    divider.removeEventListener('pointercancel', endDrag)
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    // Why: capture on the divider so the drag survives the pointer crossing either <webview>, which
    // swallows events into its own guest process and would strand the drag mid-resize.
    divider.setPointerCapture(event.pointerId)
    divider.addEventListener('pointermove', onPointerMove)
    divider.addEventListener('pointerup', endDrag)
    divider.addEventListener('pointercancel', endDrag)
  }

  divider.addEventListener('pointerdown', onPointerDown)

  return {
    element: divider,
    release: () => divider.removeEventListener('pointerdown', onPointerDown)
  }
}

export function isBrowserPageDevToolsDocked(browserPageId: string): boolean {
  return dockedByPageId.has(browserPageId)
}

export async function openBrowserPageDevTools(
  browserPageId: string,
  /** Must match the page guest's partition — see the setAttribute call below. */
  webviewPartition: string
): Promise<boolean> {
  if (dockedByPageId.has(browserPageId)) {
    return true
  }
  const container = getBrowserPageViewportContainer(browserPageId)
  if (!container) {
    return false
  }

  const wrapper = document.createElement('div')
  wrapper.dataset.browserPageDevtoolsId = browserPageId
  wrapper.className = 'flex min-h-0 shrink-0 flex-row bg-background'
  wrapper.style.width = `${clampDockWidth(dockWidthPx, container.getBoundingClientRect().width)}px`

  const divider = createDivider(wrapper, container)

  const webview = document.createElement('webview') as Electron.WebviewTag
  // Why: a <webview> with no partition never attaches here — it stays pending forever and never
  // reports a WebContents id, so devtools would have nothing to render into. Verified against the
  // running app: identical elements attach with this attribute and time out without it.
  webview.setAttribute('partition', webviewPartition)
  webview.style.display = 'flex'
  webview.style.flex = '1'
  webview.style.height = '100%'
  webview.style.border = 'none'

  wrapper.append(divider.element, webview)
  container.appendChild(wrapper)
  // Why after append: the guest is created from the attached element, matching how the page guest
  // is navigated once its container is in the DOM.
  webview.src = 'about:blank'

  const teardown = (): void => {
    divider.release()
    wrapper.remove()
  }

  const devToolsWebContentsId = await whenWebviewAttached(webview)
  if (devToolsWebContentsId === null) {
    teardown()
    return false
  }

  const opened = await window.api.browser.openDevTools({ browserPageId, devToolsWebContentsId })
  if (!opened) {
    teardown()
    return false
  }

  dockedByPageId.set(browserPageId, { wrapper, webview, release: divider.release })
  return true
}

export function closeBrowserPageDevTools(browserPageId: string): void {
  const docked = dockedByPageId.get(browserPageId)
  if (!docked) {
    return
  }
  dockedByPageId.delete(browserPageId)
  void window.api.browser.closeDevTools({ browserPageId })
  // Why: removing a focused <webview> strands focus on a dead element and the pane stops taking keys.
  if (document.activeElement === docked.webview) {
    docked.webview.blur()
  }
  docked.release()
  docked.wrapper.remove()
}

export async function toggleBrowserPageDevTools(
  browserPageId: string,
  webviewPartition: string
): Promise<boolean> {
  if (dockedByPageId.has(browserPageId)) {
    closeBrowserPageDevTools(browserPageId)
    return false
  }
  return openBrowserPageDevTools(browserPageId, webviewPartition)
}
