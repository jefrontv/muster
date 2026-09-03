import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, sent } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  sent: [] as { channel: string; payload: unknown }[]
}))

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: vi.fn(),
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))
vi.mock('../sites/site-secret-store', () => ({ setSiteSecret: vi.fn() }))
vi.mock('../sites/bitbucket-credential-store', () => ({
  getBitbucketCredentialStatus: vi.fn(),
  setBitbucketCredentials: vi.fn()
}))
vi.mock('../sites/bitbucket-listing-auth', () => ({
  isBitbucketListingConfigured: vi.fn(() => false),
  resolveBitbucketListingCredentials: vi.fn()
}))
vi.mock('../sites/bitbucket-workspace-repos', () => ({
  detectBitbucketWorkspace: vi.fn(),
  fetchBitbucketJson: vi.fn(),
  listBitbucketWorkspaceRepos: vi.fn()
}))

import { handleSiteBindUrl, registerSiteBindHandlers } from './site-bind'
import type { Store } from '../persistence'

const SENDER = {
  isDestroyed: () => false,
  send: (channel: string, payload: unknown) => {
    sent.push({ channel, payload })
  }
}

const VALID = 'muster://configure?hostname=host.example.com&username=acme&reponame=efront_au/acme'
// A password in the bad link: the whole point of the rejected event is that this never reaches it.
const BAD = 'muster://deploy?password=hunter2&hostname=host.example.com'

describe('handleSiteBindUrl rejection', () => {
  beforeEach(() => {
    handlers.clear()
    sent.length = 0
    registerSiteBindHandlers({
      listSites: () => [],
      getRepos: () => [],
      findSiteByPath: () => null,
      upsertSite: () => undefined
    } as unknown as Store)
    // Subscribing happens through the catch-up read, exactly as the renderer does it.
    void handlers.get('siteBind:pending')?.({ sender: SENDER })
  })

  it('tells subscribed renderers why a link was refused, without the link', () => {
    const outcome = handleSiteBindUrl(BAD)

    expect(outcome.ok).toBe(false)
    const rejected = sent.filter((entry) => entry.channel === 'siteBind:rejected')
    expect(rejected).toHaveLength(1)
    expect(typeof rejected[0]?.payload).toBe('string')
    expect(rejected[0]?.payload).not.toContain('hunter2')
    expect(rejected[0]?.payload).not.toContain('muster://')
    expect(sent.some((entry) => entry.channel === 'siteBind:request')).toBe(false)
  })

  it('does not emit a rejection for a link it accepts', () => {
    const outcome = handleSiteBindUrl(VALID)

    expect(outcome.ok).toBe(true)
    expect(sent.map((entry) => entry.channel)).toEqual(['siteBind:request'])
  })
})
