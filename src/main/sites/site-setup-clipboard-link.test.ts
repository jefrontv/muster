import { describe, expect, it, vi } from 'vitest'
import type { Site } from '../../shared/site-types'
import { environment, siteRecord } from './mcp/site-mcp-fake-context'
import {
  applyClipboardLinkFields,
  readClipboardLink,
  summarizeClipboardLink
} from './site-setup-clipboard-link'

const LINK =
  'muster://configure?reponame=efront_au%2Faidc&hostname=cl.1.efront.digital&username=aidcweb&password=PASSWORD%21&root_path=public_html&live_domain=aidc.com.au&branch=master'

function storeWith(site: Site): {
  store: Parameters<typeof applyClipboardLinkFields>[0]
  saved: () => Site
} {
  let current = site
  const store = {
    getSite: (id: string) => (id === current.id ? current : null),
    updateSite: (_id: string, updates: Partial<Omit<Site, 'id'>>) => {
      current = { ...current, ...updates }
      return current
    },
    flushOrThrow: vi.fn()
  }
  return { store, saved: () => current }
}

describe('clipboard bind link', () => {
  it('reads the password from a real link but leaves it out of the summary', () => {
    expect(readClipboardLink(`  ${LINK}\n`)?.password).toBe('PASSWORD!')
    const summary = summarizeClipboardLink(LINK)
    expect(summary).toEqual({
      source: 'clipboard',
      reponame: 'efront_au/aidc',
      hostname: 'cl.1.efront.digital',
      username: 'aidcweb',
      rootPath: 'public_html',
      liveDomain: 'aidc.com.au',
      environment: 'master'
    })
    expect(JSON.stringify(summary)).not.toContain('PASSWORD')
  })

  it('ignores anything that is not a link with a password', () => {
    expect(readClipboardLink('just some copied text')).toBeNull()
    expect(readClipboardLink('https://example.com/?password=x')).toBeNull()
    expect(readClipboardLink('muster://configure?hostname=h&username=u')).toBeNull()
    expect(readClipboardLink(`${LINK}&notes=${'x'.repeat(9_000)}`)).toBeNull()
  })

  it('fills the environment, keeps values the link leaves blank, and saves at once', () => {
    const { store, saved } = storeWith(
      siteRecord({
        environments: { main: environment({ deployCommand: 'npm run build' }) }
      })
    )
    const link = readClipboardLink(LINK)!
    applyClipboardLinkFields(store, 'site-1', 'main', link.fields)
    expect(saved().environments.main).toMatchObject({
      hostname: 'cl.1.efront.digital',
      username: 'aidcweb',
      rootPath: 'public_html',
      liveDomain: 'aidc.com.au',
      deployCommand: 'npm run build'
    })
    expect(store.flushOrThrow).toHaveBeenCalledTimes(1)
  })

  it('refuses an environment that was deleted while the card was open', () => {
    const { store } = storeWith(siteRecord())
    const link = readClipboardLink(LINK)!
    expect(() => applyClipboardLinkFields(store, 'site-1', 'qa', link.fields)).toThrow(/qa/)
  })
})
