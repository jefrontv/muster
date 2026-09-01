// DevTools rendered into a native view pinned over the pane's dock region.
//
// Why not a <webview> host: `setDevToolsWebContents` accepts any WebContents, but Electron only
// completes the guest↔DevTools binding for a real view. Point it at a guest and the front-end
// loads — the host's URL becomes devtools://… — while `isDevToolsOpened()` stays false and
// `devToolsWebContents` stays null, which renders as panels with a permanently empty inspector.
// Measured on Electron 43. A WebContentsView is what the API documents, and what binds.
//
// The cost is that a native view floats above all renderer content, so the renderer owns placement:
// it reports the dock rect and we mirror it, collapsing to hidden when that rect is empty.

import { WebContentsView, type BrowserWindow, type WebContents } from 'electron'

export type DevToolsDockBounds = {
  x: number
  y: number
  width: number
  height: number
}

type DevToolsDock = {
  view: WebContentsView
  window: BrowserWindow
  guest: WebContents
}

const docksByPageId = new Map<string, DevToolsDock>()

// Why round: setBounds takes integers, and fractional CSS rects otherwise seam against the divider.
function toIntegerBounds(bounds: DevToolsDockBounds): DevToolsDockBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height))
  }
}

function applyBounds(dock: DevToolsDock, bounds: DevToolsDockBounds): void {
  const next = toIntegerBounds(bounds)
  // Why zero means hidden: a parked pane reports an empty rect, and a zero-sized native view still
  // paints a sliver and still swallows clicks.
  dock.view.setVisible(next.width > 0 && next.height > 0)
  dock.view.setBounds(next)
}

export function isDevToolsDockOpen(browserPageId: string): boolean {
  return docksByPageId.has(browserPageId)
}

export function openDevToolsDock(args: {
  browserPageId: string
  guest: WebContents
  window: BrowserWindow
  bounds: DevToolsDockBounds
}): boolean {
  const existing = docksByPageId.get(args.browserPageId)
  if (existing) {
    applyBounds(existing, args.bounds)
    return true
  }

  const view = new WebContentsView()
  const dock: DevToolsDock = { view, window: args.window, guest: args.guest }
  args.window.contentView.addChildView(view)
  applyBounds(dock, args.bounds)

  try {
    args.guest.setDevToolsWebContents(view.webContents)
    args.guest.openDevTools()
  } catch {
    // Why: a guest mid-teardown rejects both calls; leaving the view attached would pin a blank
    // rectangle over the pane with no way to close it.
    destroyDock(dock)
    return false
  }

  docksByPageId.set(args.browserPageId, dock)
  // Why: closing from DevTools' own UI never routes through closeDevToolsDock, and the view would
  // stay pinned over the page.
  args.guest.once('devtools-closed', () => {
    closeDevToolsDock(args.browserPageId)
  })
  return true
}

export function setDevToolsDockBounds(browserPageId: string, bounds: DevToolsDockBounds): boolean {
  const dock = docksByPageId.get(browserPageId)
  if (!dock) {
    return false
  }
  applyBounds(dock, bounds)
  return true
}

function destroyDock(dock: DevToolsDock): void {
  try {
    if (!dock.window.isDestroyed()) {
      dock.window.contentView.removeChildView(dock.view)
    }
  } catch {
    /* window may be tearing down */
  }
  try {
    // Why explicit: "closing the DevTools does not destroy the devToolsWebContents, it is the
    // caller's responsibility" — skipping this leaks a WebContents per open.
    if (!dock.view.webContents.isDestroyed()) {
      dock.view.webContents.close()
    }
  } catch {
    /* already gone */
  }
}

export function closeDevToolsDock(browserPageId: string): boolean {
  const dock = docksByPageId.get(browserPageId)
  if (!dock) {
    return false
  }
  docksByPageId.delete(browserPageId)
  try {
    if (!dock.guest.isDestroyed() && dock.guest.isDevToolsOpened()) {
      dock.guest.closeDevTools()
    }
  } catch {
    /* guest may already be destroyed */
  }
  destroyDock(dock)
  return true
}
