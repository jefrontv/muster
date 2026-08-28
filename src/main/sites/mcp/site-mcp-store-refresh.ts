// Serves the sites slice from disk instead of this process's startup snapshot.
//
// Why: the MCP server is a second Electron instance that opens the profile's orca-data.json once
// and holds it in memory, while the GUI keeps writing to that same file. An environment added in
// the GUI after the server booted was therefore invisible here, and branch resolution reported
// "no env matches branch X" and fell back to the site's selected env. Writes merge onto the
// on-disk record for the same reason — otherwise the agent's edit would revert whatever the GUI
// changed on that site since startup.

import { readFileSync, statSync } from 'node:fs'
import type { Site, SiteCustomStep } from '../../../shared/site-types'
import type { SiteMcpStore } from './site-mcp-context'

export type SiteStoreFileReader = {
  statSync: (path: string) => { mtimeMs: number; size: number }
  readFileSync: (path: string, encoding: 'utf-8') => string
}

const NODE_READER: SiteStoreFileReader = {
  statSync: (path) => statSync(path),
  readFileSync: (path, encoding) => readFileSync(path, encoding)
}

function sortByDisplayName(sites: readonly Site[]): Site[] {
  return [...sites].sort((left, right) => left.displayName.localeCompare(right.displayName))
}

/** Path equality good enough for a store lookup: trailing separators and case on macOS/Windows. */
function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value
      .replace(/[\\/]+$/, '')
      .replace(/\\/g, '/')
      .toLowerCase()
  return normalize(left) === normalize(right)
}

export function createRefreshingSiteMcpStore(
  base: SiteMcpStore,
  options: { dataFile: string; reader?: SiteStoreFileReader }
): SiteMcpStore {
  const reader = options.reader ?? NODE_READER
  let cachedSites: Site[] | null = null
  let cachedStamp = ''

  const readSitesFromDisk = (): Site[] | null => {
    try {
      const stats = reader.statSync(options.dataFile)
      const stamp = `${stats.mtimeMs}:${stats.size}`
      if (stamp === cachedStamp && cachedSites) {
        return cachedSites
      }
      const parsed = JSON.parse(reader.readFileSync(options.dataFile, 'utf-8')) as {
        sites?: unknown
      }
      if (!Array.isArray(parsed.sites)) {
        return null
      }
      cachedSites = parsed.sites as Site[]
      cachedStamp = stamp
      return cachedSites
    } catch {
      // Unreadable or mid-write: the startup snapshot is still a better answer than none.
      return null
    }
  }

  const freshSite = (siteId: string): Site | null =>
    readSitesFromDisk()?.find((site) => site.id === siteId) ?? null
  const readLibraryFromDisk = (): SiteCustomStep[] | null => {
    try {
      const parsed = JSON.parse(reader.readFileSync(options.dataFile, 'utf-8')) as {
        siteStepLibrary?: unknown
      }
      return Array.isArray(parsed.siteStepLibrary)
        ? (parsed.siteStepLibrary as SiteCustomStep[])
        : null
    } catch {
      return null
    }
  }

  return {
    listSites: () => {
      const sites = readSitesFromDisk()
      return sites ? sortByDisplayName(sites) : base.listSites()
    },
    getSite: (siteId) => freshSite(siteId) ?? base.getSite(siteId),
    findSiteByPath: (sitePath) => {
      const sites = readSitesFromDisk()
      return sites?.find((site) => samePath(site.path, sitePath)) ?? base.findSiteByPath(sitePath)
    },
    updateSite: (siteId, updates) => {
      const current = freshSite(siteId)
      if (!current) {
        return base.updateSite(siteId, updates)
      }
      // Rebase onto the on-disk record so fields the GUI changed since startup survive the write.
      const { id: _id, ...rebased } = { ...current, ...updates }
      const written = base.updateSite(siteId, rebased)
      // Our own save moves the file's stamp; drop the cache so the next read re-parses.
      cachedSites = null
      cachedStamp = ''
      return written ?? base.upsertSite?.({ ...current, ...updates, id: siteId }) ?? null
    },
    ...(base.upsertSite ? { upsertSite: base.upsertSite } : {}),
    // Same staleness reason as sites: the GUI may have edited the library since this process
    // booted, so read the file rather than the startup snapshot.
    getSiteStepLibrary: () => readLibraryFromDisk() ?? base.getSiteStepLibrary?.() ?? [],
    ...(base.setSiteStepLibrary ? { setSiteStepLibrary: base.setSiteStepLibrary } : {})
  }
}
