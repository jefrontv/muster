// The contract that removed the per-folder click: discovered folders are adopted first, then
// everything links, and re-running changes nothing.
//
// Real temp directories, not fake paths: the link step skips a site whose folder is absent (a site
// on an unmounted volume must keep its config), so a fixture of made-up paths would adopt and then
// silently link nothing — passing the adopt assertions while proving nothing about the sidebar.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import { addDiscoveredSitesToSidebar } from './site-sidebar-sync'
import type { DiscoveredSiteCandidate } from '../../shared/site-discovery-types'

const root = mkdtempSync(join(tmpdir(), 'muster-sidebar-sync-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** A real folder under the temp root, so the link step treats it as a checkout that exists. */
function siteDir(name: string): string {
  const path = join(root, name)
  mkdirSync(path, { recursive: true })
  return path
}

function candidate(path: string, displayName: string): DiscoveredSiteCandidate {
  return { path, displayName, kind: 'wordpress', isGitRepo: true }
}
/** Minimal store: the sync only reads sites, mints them, and reads repos back for the link step. */
function createStore() {
  const sites = new Map<string, { id: string; path: string; repoId: string | null }>()
  const repos = new Map<string, { id: string }>()
  let nextId = 1
  const store = {
    listSites: () => [...sites.values()],
    findSiteByPath: (path: string) =>
      [...sites.values()].find((site) => site.path === path) ?? null,
    // derivePrimarySiteRoot reads these; the sync hands its result straight to discovery, which is
    // stubbed here, so the values only need to exist.
    getConfiguredSiteRoots: () => ['/sites'],
    getRepos: () => [],
    upsertSite: (site: { id: string; path: string; repoId: string | null }) => {
      sites.set(site.id, site)
      return site
    },
    getRepo: (id: string) => repos.get(id) ?? null,
    updateSite: (id: string, patch: { repoId?: string }) => {
      const site = sites.get(id)
      if (site && patch.repoId !== undefined) {
        site.repoId = patch.repoId
      }
      return site ?? null
    }
  }
  const addRepo = vi.fn(async (_store: unknown, path: string) => {
    const existing = [...repos.values()].find((repo) => repo.id === `repo:${path}`)
    if (existing) {
      return { repo: existing, alreadyExisted: true }
    }
    const repo = { id: `repo:${path}` }
    repos.set(repo.id, repo)
    nextId += 1
    return { repo, alreadyExisted: false }
  })
  return { store: store as unknown as Store, sites, repos, addRepo, idCount: () => nextId }
}

describe('addDiscoveredSitesToSidebar', () => {
  it('adopts discovered folders and links them without a per-folder click', async () => {
    const { store, sites, addRepo } = createStore()
    const alpha = siteDir('alpha')
    const beta = siteDir('beta')
    const discover = vi.fn(async () => ({
      candidates: [candidate(alpha, 'alpha'), candidate(beta, 'beta')],
      roots: [root],
      primaryRoot: root
    }))

    const result = await addDiscoveredSitesToSidebar(store, {
      discover: discover as never,
      addRepo: addRepo as never
    })

    expect(result.adopted).toBe(2)
    expect(result.added).toBe(2)
    expect(sites.size).toBe(2)
    // Both reached the link step, which is what actually puts them in the sidebar.
    expect(addRepo).toHaveBeenCalledTimes(2)
  })

  it('is a no-op on a second run, so firing it per watcher event is safe', async () => {
    const { store, addRepo } = createStore()
    const gamma = siteDir('gamma')
    const discoverOnce = vi.fn(async () => ({
      candidates: [candidate(gamma, 'gamma')],
      roots: [root],
      primaryRoot: root
    }))
    const first = await addDiscoveredSitesToSidebar(store, {
      discover: discoverOnce as never,
      addRepo: addRepo as never
    })
    expect(first.added).toBe(1)

    // Second pass: the folder now has a record, so discovery no longer reports it as a candidate,
    // and the link step finds the site already bound to a live repo.
    const discoverAgain = vi.fn(async () => ({
      candidates: [],
      roots: [root],
      primaryRoot: root
    }))
    const second = await addDiscoveredSitesToSidebar(store, {
      discover: discoverAgain as never,
      addRepo: addRepo as never
    })

    expect(second.adopted).toBe(0)
    expect(second.added).toBe(0)
  })

  it('does not count a folder that already had a site record as newly adopted', async () => {
    // The race the count has to survive: discovery ran before an adopt landed, so the candidate
    // list still names a path that now has a record.
    const { store, addRepo } = createStore()
    const delta = siteDir('delta')
    store.upsertSite({ id: 'existing', path: delta, repoId: null } as never)
    const discover = vi.fn(async () => ({
      candidates: [candidate(delta, 'delta')],
      roots: [root],
      primaryRoot: root
    }))

    const result = await addDiscoveredSitesToSidebar(store, {
      discover: discover as never,
      addRepo: addRepo as never
    })

    expect(result.adopted).toBe(0)
  })

  it('passes the caller roots through, so the live watcher set wins over a re-derive', async () => {
    const { store, addRepo } = createStore()
    const discover = vi.fn(async () => ({ candidates: [], roots: [], primaryRoot: '' }))

    await addDiscoveredSitesToSidebar(store, {
      discover: discover as never,
      addRepo: addRepo as never,
      roots: ['/watched/root']
    })

    expect(discover).toHaveBeenCalledWith(expect.objectContaining({ roots: ['/watched/root'] }))
  })
})
