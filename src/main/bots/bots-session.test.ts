import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const botsSession = {
    webRequest: { onBeforeSendHeaders: vi.fn() },
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn()
  }
  return {
    botsSession,
    fromPartition: vi.fn(() => botsSession),
    openExternal: vi.fn(),
    owner: null as { port: number; token: string } | null
  }
})

vi.mock('electron', () => ({
  session: { fromPartition: mocks.fromPartition },
  shell: { openExternal: mocks.openExternal }
}))
vi.mock('./bots-sidecar', () => ({
  BOTS_OWNER_HEADER: 'X-OpenMausBot-Desktop-Owner',
  botsOwnerCapability: () => mocks.owner
}))

import {
  attachBotsGuestPolicies,
  installBotsSession,
  isBotsGuest,
  isBotsWebviewAttach
} from './bots-session'
import { BOTS_PARTITION } from '../../shared/bots-types'

type HeaderListener = (
  details: { url: string; requestHeaders: Record<string, string> },
  callback: (response: { requestHeaders: Record<string, string> }) => void
) => void

function headersFor(url: string): Record<string, string> {
  const listener = mocks.botsSession.webRequest.onBeforeSendHeaders.mock
    .calls[0][0] as HeaderListener
  let sent: Record<string, string> = {}
  listener({ url, requestHeaders: { Accept: '*/*' } }, (response) => {
    sent = response.requestHeaders
  })
  return sent
}

beforeEach(() => {
  mocks.owner = { port: 18899, token: 't'.repeat(43) }
  mocks.openExternal.mockReset()
})

describe('bots session', () => {
  it('treats nothing as a Bots guest before install', () => {
    expect(isBotsGuest({ session: mocks.botsSession } as never)).toBe(false)
  })

  it('adds the owner header only for the running bots server', () => {
    installBotsSession()
    installBotsSession()
    expect(mocks.fromPartition).toHaveBeenCalledTimes(1)
    expect(mocks.fromPartition).toHaveBeenCalledWith(BOTS_PARTITION)
    expect(headersFor('http://127.0.0.1:18899/api/health')).toMatchObject({
      'X-OpenMausBot-Desktop-Owner': 't'.repeat(43)
    })
    expect(headersFor('ws://127.0.0.1:18899/ws')).toHaveProperty('X-OpenMausBot-Desktop-Owner')
    expect(headersFor('http://127.0.0.1:3000/')).not.toHaveProperty('X-OpenMausBot-Desktop-Owner')
    expect(headersFor('https://example.com/')).not.toHaveProperty('X-OpenMausBot-Desktop-Owner')
    mocks.owner = null
    expect(headersFor('http://127.0.0.1:18899/')).not.toHaveProperty('X-OpenMausBot-Desktop-Owner')
  })

  it('recognises guests on the installed session', () => {
    installBotsSession()
    expect(isBotsGuest({ session: mocks.botsSession } as never)).toBe(true)
    expect(isBotsGuest({ session: {} } as never)).toBe(false)
  })

  it('allows a webview attach only on the Bots partition at the server', () => {
    expect(isBotsWebviewAttach(BOTS_PARTITION, 'http://127.0.0.1:18899/')).toBe(true)
    expect(isBotsWebviewAttach('persist:other', 'http://127.0.0.1:18899/')).toBe(false)
    expect(isBotsWebviewAttach(BOTS_PARTITION, 'https://example.com/')).toBe(false)
    mocks.owner = null
    expect(isBotsWebviewAttach(BOTS_PARTITION, 'http://127.0.0.1:18899/')).toBe(false)
  })

  it('keeps the guest on the server and opens other links outside', () => {
    let openHandler: ((details: { url: string }) => { action: string }) | undefined
    let navigate: ((event: { preventDefault: () => void }, url: string) => void) | undefined
    const guest = {
      setWindowOpenHandler: (handler: typeof openHandler) => {
        openHandler = handler
      },
      on: (_name: string, handler: typeof navigate) => {
        navigate = handler
      }
    }
    attachBotsGuestPolicies(guest as never)

    expect(openHandler!({ url: 'https://composio.dev/' })).toEqual({ action: 'deny' })
    expect(mocks.openExternal).toHaveBeenCalledWith('https://composio.dev/')

    const inside = { preventDefault: vi.fn() }
    navigate!(inside, 'http://127.0.0.1:18899/chat')
    expect(inside.preventDefault).not.toHaveBeenCalled()

    const outside = { preventDefault: vi.fn() }
    navigate!(outside, 'file:///etc/passwd')
    expect(outside.preventDefault).toHaveBeenCalled()
    expect(mocks.openExternal).toHaveBeenCalledTimes(1)
  })
})
