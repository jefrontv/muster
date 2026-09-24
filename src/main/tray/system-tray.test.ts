import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SystemTrayModule from './system-tray'

const {
  attentionImage,
  composeAttentionMock,
  createAppIconImageMock,
  menuFromTemplateMock,
  resizedImage,
  trayInstances
} = vi.hoisted(() => {
  const resizedImage = { name: 'windows' }
  const attentionImage = { name: 'attention' }
  return {
    attentionImage,
    composeAttentionMock: vi.fn(() => attentionImage),
    createAppIconImageMock: vi.fn(),
    menuFromTemplateMock: vi.fn((template: unknown) => ({ template })),
    resizedImage,
    trayInstances: [] as FakeTray[]
  }
})

class FakeTray {
  setToolTip = vi.fn()
  setContextMenu = vi.fn()
  setImage = vi.fn()
  on = vi.fn()
  destroy = vi.fn()
  isDestroyed = vi.fn(() => false)
  constructor(public readonly image: unknown) {
    trayInstances.push(this)
  }
}

vi.mock('electron', () => ({
  Tray: FakeTray,
  Menu: { buildFromTemplate: menuFromTemplateMock }
}))

vi.mock('../app-icon', () => ({
  createAppIconImage: createAppIconImageMock
}))

vi.mock('./tray-attention-icon', () => ({
  composeTrayAttentionIcon: composeAttentionMock
}))

type TrayModule = typeof SystemTrayModule
type MenuItem = { label?: string; type?: string; click?: () => void }

const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

async function loadModule(): Promise<TrayModule> {
  vi.resetModules()
  return import('./system-tray')
}

function createOptions(
  overrides: { isDevInstance?: boolean; devInstanceLabel?: string | null } = {}
) {
  return {
    appIcon: 'classic',
    isDevInstance: overrides.isDevInstance ?? false,
    devInstanceLabel: overrides.devInstanceLabel ?? null,
    onOpen: vi.fn(),
    onQuit: vi.fn()
  }
}

function builtMenuItems(): MenuItem[] {
  return menuFromTemplateMock.mock.calls.at(-1)?.[0] as MenuItem[]
}

// Why: icon writes are deferred off the caller's stack; run the pending turn.
function flushTraySceneMutation(): void {
  vi.advanceTimersByTime(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  trayInstances.length = 0
  menuFromTemplateMock.mockClear()
  composeAttentionMock.mockClear()
  createAppIconImageMock.mockReset()
  createAppIconImageMock.mockReturnValue({ resize: vi.fn(() => resizedImage) })
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createSystemTray', () => {
  it('creates the Windows icon, Open/Quit menu, and left-click behavior', async () => {
    setPlatform('win32')
    const { createSystemTray } = await loadModule()
    const options = createOptions()

    createSystemTray(options)

    expect(trayInstances).toHaveLength(1)
    expect(trayInstances[0].image).toBe(resizedImage)
    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Muster')
    expect(builtMenuItems().map((item) => item.label)).toEqual(['Open Muster', undefined, 'Quit'])
    const clickHandler = trayInstances[0].on.mock.calls.find((call) => call[0] === 'click')?.[1]
    expect(clickHandler).toBeTypeOf('function')

    builtMenuItems()[0].click?.()
    ;(clickHandler as () => void)()
    builtMenuItems()[2].click?.()
    expect(options.onOpen).toHaveBeenCalledTimes(2)
    expect(options.onQuit).toHaveBeenCalledOnce()
  })

  it('is idempotent and creates nothing on macOS or Linux', async () => {
    setPlatform('win32')
    const { createSystemTray } = await loadModule()
    const options = createOptions()
    expect(createSystemTray(options)).toBe(createSystemTray(options))
    expect(trayInstances).toHaveLength(1)

    for (const platform of ['darwin', 'linux'] as const) {
      setPlatform(platform)
      const module = await loadModule()
      expect(module.createSystemTray(options)).toBeNull()
    }
    expect(trayInstances).toHaveLength(1)
  })
})

describe('dev instance indicator', () => {
  it('marks the Windows tooltip and menu header', async () => {
    setPlatform('win32')
    const { createSystemTray } = await loadModule()

    createSystemTray(createOptions({ isDevInstance: true, devInstanceLabel: 'my-branch' }))

    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Muster DEV (my-branch)')
    expect(builtMenuItems()[0]).toMatchObject({ label: 'Muster DEV (my-branch)', enabled: false })
  })

  it('omits the label suffix when the dev instance has none', async () => {
    setPlatform('win32')
    const { createSystemTray } = await loadModule()

    createSystemTray(createOptions({ isDevInstance: true }))

    expect(trayInstances[0].setToolTip).toHaveBeenCalledWith('Muster DEV')
    expect(builtMenuItems()[0]).toMatchObject({ label: 'Muster DEV', enabled: false })
  })

  it('adds no DEV marker for production instances', async () => {
    setPlatform('win32')
    const { createSystemTray } = await loadModule()

    createSystemTray(createOptions())

    expect(builtMenuItems()[0].label).toBe('Open Muster')
  })
})

describe('setTrayAttention', () => {
  it('swaps the icon in and back out', async () => {
    setPlatform('win32')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    flushTraySceneMutation()
    expect(composeAttentionMock).toHaveBeenCalledWith(resizedImage)
    expect(created.setImage).toHaveBeenCalledWith(attentionImage)
    setTrayAttention(false)
    flushTraySceneMutation()
    expect(created.setImage).toHaveBeenLastCalledWith(resizedImage)
  })

  it('reflects attention requested before deferred creation', async () => {
    setPlatform('win32')
    const { createSystemTray, setTrayAttention } = await loadModule()
    setTrayAttention(true)
    createSystemTray(createOptions())

    expect(trayInstances[0].setImage).toHaveBeenCalledWith(attentionImage)
  })

  it('never mutates the icon inside the caller stack', async () => {
    setPlatform('win32')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    expect(created.setImage).not.toHaveBeenCalled()

    flushTraySceneMutation()
    expect(created.setImage).toHaveBeenCalledWith(attentionImage)
  })

  it('ignores repeated same-state calls and collapses a burst into one repaint', async () => {
    setPlatform('win32')
    const { createSystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    setTrayAttention(true)
    setTrayAttention(false)
    setTrayAttention(true)
    flushTraySceneMutation()
    expect(created.setImage).toHaveBeenCalledTimes(1)
    expect(created.setImage).toHaveBeenCalledWith(attentionImage)

    setTrayAttention(true)
    flushTraySceneMutation()
    expect(created.setImage).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the tray is destroyed before the deferred repaint runs', async () => {
    setPlatform('win32')
    const { createSystemTray, destroySystemTray, setTrayAttention } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]
    created.setImage.mockClear()

    setTrayAttention(true)
    destroySystemTray()

    expect(() => flushTraySceneMutation()).not.toThrow()
    expect(created.setImage).not.toHaveBeenCalled()
  })
})

describe('destroySystemTray', () => {
  it('destroys idempotently', async () => {
    setPlatform('win32')
    const { createSystemTray, destroySystemTray } = await loadModule()
    createSystemTray(createOptions())
    const created = trayInstances[0]

    destroySystemTray()
    destroySystemTray()

    expect(created.destroy).toHaveBeenCalledOnce()
  })
})

describe('menu action hardening', () => {
  it('contains a throwing menu-item callback instead of crashing', async () => {
    setPlatform('win32')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { createSystemTray } = await loadModule()
    const options = createOptions()
    options.onOpen.mockImplementation(() => {
      throw new Error('boom')
    })
    createSystemTray(options)

    expect(() => builtMenuItems()[0].click?.()).not.toThrow()
    expect(error).toHaveBeenCalledWith('[system-tray] menu action failed', expect.any(Error))
  })
})
