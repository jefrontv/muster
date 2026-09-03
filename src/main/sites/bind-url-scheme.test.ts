import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setAsDefaultProtocolClientMock, removeAsDefaultProtocolClientMock } = vi.hoisted(() => ({
  setAsDefaultProtocolClientMock: vi.fn(),
  removeAsDefaultProtocolClientMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    setAsDefaultProtocolClient: setAsDefaultProtocolClientMock,
    removeAsDefaultProtocolClient: removeAsDefaultProtocolClientMock
  }
}))

import { registerSiteBindUrlSchemes } from './bind-url-scheme'
import { SITE_BIND_URL_SCHEME } from './site-bind-url'

function claimedSchemes(): string[] {
  return setAsDefaultProtocolClientMock.mock.calls.map((call) => call[0] as string)
}

function releasedSchemes(): string[] {
  return removeAsDefaultProtocolClientMock.mock.calls.map((call) => call[0] as string)
}

describe('registerSiteBindUrlSchemes', () => {
  beforeEach(() => {
    setAsDefaultProtocolClientMock.mockReset()
    removeAsDefaultProtocolClientMock.mockReset()
  })

  it('claims the muster scheme from a packaged build', () => {
    registerSiteBindUrlSchemes(false)

    expect(claimedSchemes()).toEqual([SITE_BIND_URL_SCHEME])
    expect(releasedSchemes()).toEqual([])
  })

  it('never claims ocsites, which belongs to the separately installed ocsites app', () => {
    // Why this is a regression test and not a detail: setAsDefaultProtocolClient is an active
    // takeover that runs on every launch, so claiming 'ocsites' would re-steal the scheme from the
    // user's ocsites install each time Muster starts, even after they reassigned it back.
    registerSiteBindUrlSchemes(false)

    expect(claimedSchemes()).not.toContain('ocsites')
  })

  it('claims nothing from a dev run, on any platform', () => {
    // A dev build runs from node_modules/electron, so claiming pointed every muster:// link the
    // user clicked at a bare Electron binary instead of at their installed app.
    registerSiteBindUrlSchemes(true)

    expect(claimedSchemes()).toEqual([])
  })

  it('hands the scheme back on a dev run, so ownership returns to the installed app', () => {
    // The theft outlived the dev run: without releasing it, the OS kept routing links to the dev
    // binary long after it exited. The packaged build re-claims on its next launch.
    registerSiteBindUrlSchemes(true)

    expect(releasedSchemes()).toEqual([SITE_BIND_URL_SCHEME])
  })
})
