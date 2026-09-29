import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  send: vi.fn(),
  envConfigured: { current: false },
  oauthAvailable: { current: true },
  beginOAuth: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler),
    removeHandler: (channel: string) => mocks.handlers.delete(channel)
  },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }]
  }
}))
vi.mock('../bitbucket/credential-store', () => ({
  clearStoredBitbucketCredential: vi.fn(),
  getStoredBitbucketCredentialStatus: vi.fn(),
  setStoredBitbucketCredential: vi.fn()
}))
vi.mock('../bitbucket/client', () => ({
  getBitbucketAuthStatus: vi.fn(async () => ({
    configured: true,
    authenticated: true,
    account: null
  })),
  getBitbucketEnvironmentAuthStatus: () => ({ configured: mocks.envConfigured.current })
}))
vi.mock('../bitbucket/oauth-config', () => ({
  isBitbucketOAuthAvailable: () => mocks.oauthAvailable.current
}))
vi.mock('../bitbucket/oauth-flow', () => ({
  beginBitbucketOAuthLogin: mocks.beginOAuth,
  cancelBitbucketOAuth: vi.fn()
}))
vi.mock('./preflight', () => ({ _resetPreflightCache: vi.fn() }))

import { _resetBitbucketAuthLossForTests, reportBitbucketAuthLoss } from '../bitbucket/auth-loss'
import { registerBitbucketAuthHandlers } from './bitbucket-auth'

function invoke(channel: string): unknown {
  const handler = mocks.handlers.get(channel)
  if (!handler) {
    throw new Error(`no handler for ${channel}`)
  }
  return handler({})
}

describe('Bitbucket auth loss IPC', () => {
  beforeEach(() => {
    _resetBitbucketAuthLossForTests()
    mocks.handlers.clear()
    mocks.send.mockReset()
    mocks.beginOAuth.mockReset()
    mocks.envConfigured.current = false
    mocks.oauthAvailable.current = true
    registerBitbucketAuthHandlers()
  })

  it('broadcasts a loss on the saved credential and serves it to late windows', async () => {
    reportBitbucketAuthLoss('token-rejected', 5)

    expect(mocks.send).toHaveBeenCalledWith('bitbucketAuth:lossChanged', {
      reason: 'token-rejected',
      detectedAt: 5
    })
    await expect(invoke('bitbucketAuth:pendingLoss')).resolves.toEqual({
      reason: 'token-rejected',
      detectedAt: 5
    })
  })

  it('stays silent while environment credentials are in charge', () => {
    mocks.envConfigured.current = true
    reportBitbucketAuthLoss('token-rejected')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('stays silent when this build cannot run the reconnect flow', () => {
    mocks.oauthAvailable.current = false
    reportBitbucketAuthLoss('refresh-rejected')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('closes the prompt everywhere on "Not now" and keeps it closed', async () => {
    reportBitbucketAuthLoss('token-rejected')
    await invoke('bitbucketAuth:dismissLoss')
    reportBitbucketAuthLoss('token-rejected')

    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.send).toHaveBeenLastCalledWith('bitbucketAuth:lossChanged', null)
    await expect(invoke('bitbucketAuth:pendingLoss')).resolves.toBeNull()
  })

  it('clears the loss after a successful reconnect so a later failure prompts again', async () => {
    mocks.beginOAuth.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresAt: 9 })
    reportBitbucketAuthLoss('refresh-rejected')
    await invoke('bitbucketAuth:dismissLoss')

    await expect(invoke('bitbucketAuth:beginOAuth')).resolves.toMatchObject({ ok: true })
    reportBitbucketAuthLoss('token-rejected')

    expect(mocks.send).toHaveBeenLastCalledWith(
      'bitbucketAuth:lossChanged',
      expect.objectContaining({ reason: 'token-rejected' })
    )
  })

  it('clears the loss when the user disconnects on purpose', async () => {
    reportBitbucketAuthLoss('token-rejected')
    await invoke('bitbucketAuth:clear')

    expect(mocks.send).toHaveBeenLastCalledWith('bitbucketAuth:lossChanged', null)
    await expect(invoke('bitbucketAuth:pendingLoss')).resolves.toBeNull()
  })
})
