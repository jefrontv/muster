// The pane-side half of docked devtools: reserve the space, report where it is.
//
// Why a placeholder instead of a host element: DevTools only binds to a native view (see
// devtools-dock.ts in main), and a native view floats above all renderer content rather than
// flowing in it. So the renderer owns geometry only — this module keeps an empty flex child in the
// pane so the page guest shrinks correctly, then mirrors that child's rect to main.

import { getBrowserPageViewportContainer } from './browser-page-viewport'

const DEFAULT_DOCK_WIDTH_PX = 480
const MIN_DOCK_WIDTH_PX = 260
// Why: the page must keep some width while dragging, or the divider can be pushed past the
// container edge with no handle left to drag back.
const MIN_PAGE_WIDTH_PX = 220

type DockRect = { x: number; y: number; width: number; height: number }

type DockedDevTools = {
  wrapper: HTMLDivElement
  surface: HTMLDivElement
  release: () => void
}

const dockedByPageId = new Map<string, DockedDevTools>()

// Shared across tabs, like Chrome's dock width: resize one, open another, they agree.
let dockWidthPx = DEFAULT_DOCK_WIDTH_PX

function clampDockWidth(requestedPx: number, containerWidthPx: number): number {
  const maxWidthPx = Math.max(MIN_DOCK_WIDTH_PX, containerWidthPx - MIN_PAGE_WIDTH_PX)
  return Math.min(Math.max(requestedPx, MIN_DOCK_WIDTH_PX), maxWidthPx)
}

function readRect(surface: HTMLDivElement): DockRect {
  const rect = surface.getBoundingClientRect()
  // Why guard on visibility: a parked pane keeps the element mounted but collapsed, and an empty
  // rect is how main knows to hide the native view rather than pin a sliver over the page.
  if (rect.width <= 0 || rect.height <= 0 || surface.offsetParent === null) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function sameRect(a: DockRect, b: DockRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/**
 * Mirrors the placeholder's rect to main for as long as the dock is open.
 *
 * Why a frame loop rather than ResizeObserver: the rect moves without resizing — toggling the
 * sidebar, switching panes, scrolling a tab strip — and observers report size, not position. The
 * loop only sends IPC when one of four numbers changes, so a still pane costs a comparison a frame.
 */
function trackRect(browserPageId: string, surface: HTMLDivElement): () => void {
  let frame = 0
  let last: DockRect | null = null

  const tick = (): void => {
    const next = readRect(surface)
    if (last === null || !sameRect(last, next)) {
      last = next
      void window.api.browser.setDevToolsBounds({ browserPageId, bounds: next })
    }
    frame = window.requestAnimationFrame(tick)
  }

  frame = window.requestAnimationFrame(tick)
  return () => window.cancelAnimationFrame(frame)
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
    // Why capture on the divider: the pointer crosses the page <webview> and the native devtools
    // view mid-drag, and both swallow events into another process, stranding the resize.
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

export async function openBrowserPageDevTools(browserPageId: string): Promise<boolean> {
  if (dockedByPageId.has(browserPageId)) {
    return true
  }
  const container = getBrowserPageViewportContainer(browserPageId)
  if (!container) {
    return false
  }

  const wrapper = document.createElement('div')
  wrapper.dataset.browserPageDevtoolsId = browserPageId
  wrapper.className = 'flex min-h-0 shrink-0 flex-row'
  wrapper.style.width = `${clampDockWidth(dockWidthPx, container.getBoundingClientRect().width)}px`

  const divider = createDivider(wrapper, container)

  // Why a visible background: the native view is not painted by the renderer, so without this the
  // pane shows a hole through to whatever is behind it for the frame before the view is placed.
  const surface = document.createElement('div')
  surface.dataset.browserPageDevtoolsSurface = ''
  surface.className = 'min-w-0 flex-1 bg-background'

  wrapper.append(divider.element, surface)
  container.appendChild(wrapper)

  const opened = await window.api.browser.openDevTools({
    browserPageId,
    bounds: readRect(surface)
  })
  if (!opened) {
    divider.release()
    wrapper.remove()
    return false
  }

  const stopTracking = trackRect(browserPageId, surface)
  dockedByPageId.set(browserPageId, {
    wrapper,
    surface,
    release: () => {
      stopTracking()
      divider.release()
    }
  })
  return true
}

export function closeBrowserPageDevTools(browserPageId: string): void {
  const docked = dockedByPageId.get(browserPageId)
  if (!docked) {
    return
  }
  dockedByPageId.delete(browserPageId)
  docked.release()
  docked.wrapper.remove()
  void window.api.browser.closeDevTools({ browserPageId })
}

export async function toggleBrowserPageDevTools(browserPageId: string): Promise<boolean> {
  if (dockedByPageId.has(browserPageId)) {
    closeBrowserPageDevTools(browserPageId)
    return false
  }
  return openBrowserPageDevTools(browserPageId)
}
