import { describe, expect, it, vi } from 'vitest'
import type { Site } from '../../../shared/site-types'
import type { SiteMcpStore } from './site-mcp-context'
import { createRefreshingSiteMcpStore, type SiteStoreFileReader } from './site-mcp-store-refresh'

function site(partial: Partial<Site> & { id: string }): Site {
  return {
    displayName: partial.id,
    path: `/repos/${partial.id}`,
    environments: {},
    activeEnvironment: '',
    ...partial
  } as Site
}

/** A base store frozen at boot, like the snapshot the MCP process actually holds. */
function staleBase(sites: Site[]): SiteMcpStore & { updated: [string, unknown][] } {
  const updated: [string, unknown][] = []
  return {
    updated,
    listSites: () => sites,
    getSite: (siteId) => sites.find((entry) => entry.id === siteId) ?? null,
    findSiteByPath: (sitePath) => sites.find((entry) => entry.path === sitePath) ?? null,
    updateSite: (siteId, updates) => {
      updated.push([siteId, updates])
      const existing = sites.find((entry) => entry.id === siteId)
      return existing ? { ...existing, ...updates, id: siteId } : null
    }
  }
}

function reader(payload: { sites: Site[] }, stamp = { mtimeMs: 1, size: 10 }): SiteStoreFileReader {
  return {
    statSync: vi.fn(() => stamp),
    readFileSync: vi.fn(() => JSON.stringify(payload))
  }
}

describe('createRefreshingSiteMcpStore', () => {
  it('serves environments the GUI added after this process booted', () => {
    const base = staleBase([site({ id: 'tti', environments: { main: {} as never } })])
    const store = createRefreshingSiteMcpStore(base, {
      dataFile: '/data.json',
      reader: reader({
        sites: [site({ id: 'tti', environments: { main: {} as never, staging: {} as never } })]
      })
    })

    expect(Object.keys(store.getSite('tti')?.environments ?? {})).toEqual(['main', 'staging'])
    expect(Object.keys(store.listSites()[0].environments)).toEqual(['main', 'staging'])
  })

  it('re-reads only when the file changes', () => {
    const fileReader = reader({ sites: [site({ id: 'tti' })] })
    const store = createRefreshingSiteMcpStore(staleBase([]), {
      dataFile: '/data.json',
      reader: fileReader
    })

    store.listSites()
    store.listSites()
    store.getSite('tti')

    expect(fileReader.readFileSync).toHaveBeenCalledTimes(1)
    expect(fileReader.statSync).toHaveBeenCalledTimes(3)
  })

  it('finds a site by path that only exists on disk', () => {
    const store = createRefreshingSiteMcpStore(staleBase([]), {
      dataFile: '/data.json',
      reader: reader({ sites: [site({ id: 'tti', path: '/repos/tti' })] })
    })

    expect(store.findSiteByPath('/repos/tti/')?.id).toBe('tti')
  })

  it('rebases a write onto the on-disk record', () => {
    // Why: writing the stale snapshot back would drop the environment the GUI just added.
    const base = staleBase([site({ id: 'tti', environments: { main: {} as never } })])
    const store = createRefreshingSiteMcpStore(base, {
      dataFile: '/data.json',
      reader: reader({
        sites: [
          site({
            id: 'tti',
            displayName: 'Renamed In Gui',
            environments: { main: {} as never, staging: {} as never }
          })
        ]
      })
    })

    store.updateSite('tti', { activeEnvironment: 'staging' })

    const [siteId, updates] = base.updated[0]
    expect(siteId).toBe('tti')
    expect(updates).toMatchObject({
      displayName: 'Renamed In Gui',
      activeEnvironment: 'staging',
      environments: { main: {}, staging: {} }
    })
    expect(updates).not.toHaveProperty('id')
  })

  it('falls back to the snapshot when the file is unreadable', () => {
    const base = staleBase([site({ id: 'tti' })])
    const store = createRefreshingSiteMcpStore(base, {
      dataFile: '/data.json',
      reader: {
        statSync: () => {
          throw new Error('ENOENT')
        },
        readFileSync: () => '{}'
      }
    })

    expect(store.getSite('tti')?.id).toBe('tti')
    expect(store.listSites()).toHaveLength(1)
  })

  it('upserts a site the snapshot never had', () => {
    const upsertSite = vi.fn((entry: Site) => entry)
    const base: SiteMcpStore = { ...staleBase([]), upsertSite }
    const store = createRefreshingSiteMcpStore(base, {
      dataFile: '/data.json',
      reader: reader({ sites: [site({ id: 'tti' })] })
    })

    store.updateSite('tti', { activeEnvironment: 'main' })

    expect(upsertSite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tti', activeEnvironment: 'main' })
    )
  })
})
