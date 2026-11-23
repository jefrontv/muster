import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Site } from '../../shared/site-types'
import type { Repo } from '../../shared/types'
import { adoptSiteForProject, adoptSitesForProjects } from './site-for-added-project'

function fakeStore(roots: string[] = [], sites: Site[] = []) {
  return {
    sites,
    getConfiguredSiteRoots: () => roots,
    findSiteByPath: (p: string) => sites.find((site) => site.path === p) ?? null,
    upsertSite: (site: Site) => {
      sites.push(site)
      return site
    },
    updateSite: (id: string, updates: Partial<Site>) => {
      const site = sites.find((entry) => entry.id === id)
      return site ? Object.assign(site, updates) : null
    }
  }
}

const onDisk =
  (...files: string[]) =>
  (target: string) =>
    files.includes(target)
const repo = (p: string, extra: Partial<Repo> = {}) =>
  ({ id: 'repo-1', path: p, displayName: path.basename(p), ...extra }) as Repo

describe('adoptSiteForProject', () => {
  it('makes a WordPress project a site wherever it sits', () => {
    const store = fakeStore()
    const site = adoptSiteForProject(store, repo('/w/client'), onDisk('/w/client/wp-config.php'))
    expect(site).toMatchObject({ path: '/w/client', repoId: 'repo-1', displayName: 'client' })
  })

  it("keys a LocalWP checkout's site on Local's folder above app/public", () => {
    const store = fakeStore()
    const project = path.join('/local', 'shop', 'app', 'public')
    const site = adoptSiteForProject(
      store,
      repo(project, { displayName: 'shop' }),
      onDisk(path.join(project, 'wp-config.php'))
    )
    expect(site?.path).toBe(path.join('/local', 'shop'))
  })

  it('takes a plain git checkout only inside a chosen site folder', () => {
    const git = onDisk('/sites/tool/.git', '/code/tool/.git')
    expect(adoptSiteForProject(fakeStore(['/sites']), repo('/sites/tool'), git)?.path).toBe(
      '/sites/tool'
    )
    expect(adoptSiteForProject(fakeStore(['/sites']), repo('/code/tool'), git)).toBeNull()
    expect(adoptSiteForProject(fakeStore(), repo('/sites/tool'), git)).toBeNull()
  })

  it('links an existing record instead of adding a second, and skips SSH projects', () => {
    const existing = { id: 'site-1', path: '/w/client', repoId: null } as unknown as Site
    const store = fakeStore([], [existing])
    adoptSitesForProjects(
      {
        ...store,
        getRepos: () => [repo('/w/client'), repo('/w/remote', { id: 'r2', connectionId: 'ssh' })]
      },
      onDisk('/w/client/wp-config.php', '/w/remote/wp-config.php')
    )
    expect(store.sites).toEqual([{ ...existing, repoId: 'repo-1' }])
  })
})

describe('adoptSiteForProject without wp-config.php', () => {
  const shop = path.join('/local', 'shop')
  const appPublic = path.join(shop, 'app', 'public')

  it('adopts a LocalWP checkout whose wp-config.php is gitignored', () => {
    const exists = onDisk(appPublic, path.join(shop, 'conf'), path.join(appPublic, '.git'))
    expect(adoptSiteForProject(fakeStore(), repo(appPublic), exists)?.path).toBe(shop)
  })

  it('adopts a project still on the LocalWP site folder itself', () => {
    const exists = onDisk(appPublic, path.join(shop, 'logs'))
    expect(adoptSiteForProject(fakeStore(), repo(shop), exists)?.path).toBe(shop)
  })

  it('adopts a Bedrock or core-only WordPress project anywhere', () => {
    const bedrock = onDisk(path.join('/w/bed', 'web', 'wp-config.php'))
    expect(adoptSiteForProject(fakeStore(), repo('/w/bed'), bedrock)?.path).toBe('/w/bed')
    const core = onDisk(path.join('/w/core', 'wp-includes'))
    expect(adoptSiteForProject(fakeStore(), repo('/w/core'), core)?.path).toBe('/w/core')
  })

  it('picks up projects added before the update on the next start', () => {
    const store = {
      ...fakeStore(),
      getRepos: () => [repo(shop, { id: 'old-project' }), repo('/code/tool', { id: 'tool' })]
    }
    adoptSitesForProjects(store, onDisk(appPublic, path.join(shop, 'conf')))
    expect(store.sites.map((site) => [site.path, site.repoId])).toEqual([[shop, 'old-project']])
  })
})
