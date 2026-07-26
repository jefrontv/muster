import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setAsDefaultProtocolClientMock } = vi.hoisted(() => ({
  setAsDefaultProtocolClientMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    setAsDefaultProtocolClient: setAsDefaultProtocolClientMock
  }
}))

import {
  LEGACY_SITE_BIND_URL_SCHEME,
  SITE_BIND_URL_SCHEME,
  registerSiteBindUrlSchemes
} from './bind-url-scheme'

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

  it('never seizes the legacy ocsites scheme from an installed OcsitesHandler.app', () => {
    // Why this is a regression test and not a detail: setAsDefaultProtocolClient is an active
    // takeover that runs on every launch, so claiming 'ocsites' would re-steal the scheme from
    // ocsites each time Muster starts, even after the user reassigned it back. Legacy links still
    // reach Muster via the packaged Info.plist claim and parseSiteBindUrl's scheme allowance.
    registerSiteBindUrlSchemes(false)

    expect(claimedSchemes()).not.toContain(LEGACY_SITE_BIND_URL_SCHEME)
  })

  it('keeps the legacy scheme exported so the parser and Info.plist stay in sync', () => {
    expect(LEGACY_SITE_BIND_URL_SCHEME).toBe('ocsites')
  })
})
