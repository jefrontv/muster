import { afterEach, describe, expect, it, vi } from 'vitest'

const { webContentsViewInstances } = vi.hoisted(() => ({
  webContentsViewInstances: [] as {
    setBounds: ReturnType<typeof vi.fn>
    setVisible: ReturnType<typeof vi.fn>
    webContents: {
      id: number
      isDestroyed: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
    }
  }[]
}))

vi.mock('electron', () => ({
  WebContentsView: class {
    setBounds = vi.fn()
    setVisible = vi.fn()
    webContents = {
      id: 900 + webContentsViewInstances.length,
      isDestroyed: vi.fn(() => false),
      close: vi.fn()
    }
    constructor() {
      webContentsViewInstances.push(this as never)
    }
  }
}))

const { closeDevToolsDock, isDevToolsDockOpen, openDevToolsDock, setDevToolsDockBounds } =
  await import('./devtools-dock')

const BOUNDS = { x: 100, y: 50, width: 480, height: 600 }

function createWindow(): {
  isDestroyed: ReturnType<typeof vi.fn>
  contentView: { addChildView: ReturnType<typeof vi.fn>; removeChildView: ReturnType<typeof vi.fn> }
} {
  return {
    isDestroyed: vi.fn(() => false),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  }
}

function createGuest(): Record<string, unknown> {
  return {
    isDestroyed: vi.fn(() => false),
    isDevToolsOpened: vi.fn(() => true),
    setDevToolsWebContents: vi.fn(),
    openDevTools: vi.fn(),
    closeDevTools: vi.fn(),
    once: vi.fn()
  }
}

afterEach(() => {
  closeDevToolsDock('page-1')
  webContentsViewInstances.length = 0
})

describe('openDevToolsDock', () => {
  it('points the guest at a native view, which is the only host devtools binds to', () => {
    const guest = createGuest()
    const window = createWindow()

    const ok = openDevToolsDock({
      browserPageId: 'page-1',
      guest: guest as never,
      window: window as never,
      bounds: BOUNDS
    })

    expect(ok).toBe(true)
    const view = webContentsViewInstances[0]!
    expect(window.contentView.addChildView).toHaveBeenCalledWith(view)
    expect(guest.setDevToolsWebContents).toHaveBeenCalledWith(view.webContents)
    // Why no `mode`: passing one makes Electron dock natively and leaves the view a placeholder.
    expect(guest.openDevTools).toHaveBeenCalledWith()
    expect(view.setBounds).toHaveBeenCalledWith(BOUNDS)
  })

  it('rounds fractional rects, because setBounds takes integers', () => {
    openDevToolsDock({
      browserPageId: 'page-1',
      guest: createGuest() as never,
      window: createWindow() as never,
      bounds: { x: 10.4, y: 20.6, width: 480.5, height: 600.2 }
    })

    expect(webContentsViewInstances[0]!.setBounds).toHaveBeenCalledWith({
      x: 10,
      y: 21,
      width: 481,
      height: 600
    })
  })

  it('hides the view for an empty rect, so a parked pane keeps no sliver', () => {
    openDevToolsDock({
      browserPageId: 'page-1',
      guest: createGuest() as never,
      window: createWindow() as never,
      bounds: { x: 0, y: 0, width: 0, height: 0 }
    })

    expect(webContentsViewInstances[0]!.setVisible).toHaveBeenCalledWith(false)
  })

  it('tears the view down when the guest refuses, leaving no pinned rectangle', () => {
    const guest = createGuest()
    guest.setDevToolsWebContents = vi.fn(() => {
      throw new Error('guest is gone')
    })
    const window = createWindow()

    const ok = openDevToolsDock({
      browserPageId: 'page-1',
      guest: guest as never,
      window: window as never,
      bounds: BOUNDS
    })

    expect(ok).toBe(false)
    expect(isDevToolsDockOpen('page-1')).toBe(false)
    expect(window.contentView.removeChildView).toHaveBeenCalled()
    expect(webContentsViewInstances[0]!.webContents.close).toHaveBeenCalled()
  })
})

describe('setDevToolsDockBounds', () => {
  it('mirrors a moved rect onto the view', () => {
    openDevToolsDock({
      browserPageId: 'page-1',
      guest: createGuest() as never,
      window: createWindow() as never,
      bounds: BOUNDS
    })

    const moved = { x: 200, y: 50, width: 300, height: 600 }
    expect(setDevToolsDockBounds('page-1', moved)).toBe(true)
    expect(webContentsViewInstances[0]!.setBounds).toHaveBeenLastCalledWith(moved)
  })

  it('reports failure for a page with no dock', () => {
    expect(setDevToolsDockBounds('page-absent', BOUNDS)).toBe(false)
  })
})

describe('closeDevToolsDock', () => {
  it('destroys the view, since closing devtools does not', () => {
    const guest = createGuest()
    const window = createWindow()
    openDevToolsDock({
      browserPageId: 'page-1',
      guest: guest as never,
      window: window as never,
      bounds: BOUNDS
    })
    const view = webContentsViewInstances[0]!

    expect(closeDevToolsDock('page-1')).toBe(true)
    expect(guest.closeDevTools).toHaveBeenCalledTimes(1)
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(view)
    // Why: Electron leaves devToolsWebContents alive on close; without this each open leaks one.
    expect(view.webContents.close).toHaveBeenCalledTimes(1)
    expect(isDevToolsDockOpen('page-1')).toBe(false)
  })

  it('reports failure for a page with no dock', () => {
    expect(closeDevToolsDock('page-absent')).toBe(false)
  })
})
