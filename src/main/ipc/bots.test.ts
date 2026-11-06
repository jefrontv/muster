import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/types'

const { stopBotsSidecar } = vi.hoisted(() => ({ stopBotsSidecar: vi.fn(async () => {}) }))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn(), on: vi.fn() }
}))
vi.mock('../bots/bots-session', () => ({ installBotsSession: vi.fn() }))
vi.mock('./bots-comment-drafts', () => ({ registerBotsCommentDraftHandlers: vi.fn() }))
vi.mock('../bots/bots-sidecar', () => ({
  botsDataDir: () => '/tmp/bots',
  getBotsSidecarStatus: vi.fn(),
  onBotsSidecarStatus: vi.fn(() => () => {}),
  readBotsServerConfig: vi.fn(),
  restartBotsSidecar: vi.fn(),
  setBotsAgentResolvers: vi.fn(),
  setBotsCredential: vi.fn(),
  startBotsSidecar: vi.fn(),
  stopBotsSidecar
}))

import { registerBotsHandlers } from './bots'

type Listener = (updates: Partial<GlobalSettings>, settings: GlobalSettings) => void

function fakeStore(): {
  listeners: Set<Listener>
  emit: (updates: Partial<GlobalSettings>) => void
} {
  const listeners = new Set<Listener>()
  return {
    listeners,
    emit: (updates) => {
      for (const listener of listeners) {
        listener(updates, {} as GlobalSettings)
      }
    }
  }
}

beforeEach(() => stopBotsSidecar.mockClear())

describe('registerBotsHandlers', () => {
  it('stops the bots server when Bots is turned off, and only then', () => {
    const store = fakeStore()
    const subscribe = (listener: Listener) => {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    }
    registerBotsHandlers(undefined, { onSettingsChanged: subscribe })
    store.emit({ experimentalBots: true })
    store.emit({ botsIntroSeen: true })
    expect(stopBotsSidecar).not.toHaveBeenCalled()
    store.emit({ experimentalBots: false })
    expect(stopBotsSidecar).toHaveBeenCalledTimes(1)

    // Registering again replaces the subscription rather than stacking a second one.
    registerBotsHandlers(undefined, { onSettingsChanged: subscribe })
    expect(store.listeners.size).toBe(1)
  })
})
