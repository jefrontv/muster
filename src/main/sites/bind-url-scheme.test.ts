import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setAsDefaultProtocolClientMock } = vi.hoisted(() => ({
  setAsDefaultProtocolClientMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    setAsDefaultProtocolClient: setAsDefaultProtocolClientMock
  }
}))

import { registerSiteBindUrlSchemes } from './bind-url-scheme'
import { SITE_BIND_URL_SCHEME } from './site-bind-url'

function claimedSchemes(): string[] {
  return setAsDefaultProtocolClientMock.mock.calls.map((call) => call[0] as string)
}

describe('registerSiteBindUrlSchemes', () => {
  beforeEach(() => {
    setAsDefaultProtocolClientMock.mockReset()
  })

  it('claims the muster scheme', () => {
    registerSiteBindUrlSchemes(false)

    expect(claimedSchemes()).toEqual([SITE_BIND_URL_SCHEME])
  })

  it('never claims ocsites, which belongs to the separately installed ocsites app', () => {
    // Why this is a regression test and not a detail: setAsDefaultProtocolClient is an active
    // takeover that runs on every launch, so claiming 'ocsites' would re-steal the scheme from the
    // user's ocsites install each time Muster starts, even after they reassigned it back.
    registerSiteBindUrlSchemes(false)

    expect(claimedSchemes()).not.toContain('ocsites')
  })
})
