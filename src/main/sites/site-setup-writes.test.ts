import { describe, expect, it, vi } from 'vitest'
import type { Site } from '../../shared/site-types'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { SiteSetupJobUpdate } from '../../shared/site-setup-approval-types'
import { getSiteSetupJob, setSiteSetupJobListener } from './site-setup-jobs'
import { writeSiteSetup, type SiteSetupWriteDeps } from './site-setup-writes'

function harness(overrides: Partial<SiteSetupWriteDeps> = {}) {
  const sites: Site[] = []
  const runtime = {
    cloneRepo: vi.fn(
      async (
        _url: string,
        destination: string,
        _host?: unknown,
        _onProgress?: (progress: { phase: string; percent: number }) => void
      ) => ({
        id: 'r-new',
        displayName: 'acme',
        path: `${destination}/acme`,
        kind: 'git'
      })
    ),
    addRepo: vi.fn(),
    updateRepo: vi.fn(async (_repo: string, updates: Record<string, unknown>) => ({
      id: 'r1',
      displayName: (updates.displayName as string) ?? 'acme'
    })),
    removeProject: vi.fn(async () => ({ removed: true }))
  }
  const store = {
    getRepos: () => [{ id: 'r1', path: '/Sites/acme', displayName: 'acme' }],
    getSite: (id: string) => sites.find((site) => site.id === id) ?? null,
    findSiteByPath: (path: string) => sites.find((site) => site.path === path) ?? null,
    upsertSite: (site: Site) => {
      sites.push(site)
      return site
    },
    updateSite: (id: string, patch: Partial<Site>) => {
      const site = sites.find((candidate) => candidate.id === id)
      return site ? Object.assign(site, patch) : null
    },
    getSettings: () => ({}),
    getConfiguredSiteRoots: () => ['/Sites'],
    listSites: () => sites,
    flushOrThrow: vi.fn()
  } as unknown as Store
  const changed: string[] = []
  const deps: SiteSetupWriteDeps = {
    store,
    runtime: () => runtime as unknown as OrcaRuntimeService,
    consumeApproval: () => true,
    onSiteChanged: (siteId) => changed.push(siteId),
    republishSiteRoots: vi.fn(),
    onSitesAdded: vi.fn(),
    detectStack: vi.fn(async () => ({ stack: 'plain', registered: false }) as never),
    runStackSetup: vi.fn(async () => ({ ok: true })),
    importOcsites: vi.fn(async () => ({ created: 2 })),
    stageBindLink: vi.fn(() => ({ ok: true, error: '' })),
    ...overrides
  }
  return { deps, runtime, sites, changed }
}

describe('writeSiteSetup', () => {
  it('refuses to run without a matching approval', async () => {
    const consumeApproval = vi.fn(() => false)
    const { deps, runtime } = harness({ consumeApproval })
    await expect(
      writeSiteSetup(deps, 'remove-project', 'approval-1', { repo: 'r1' })
    ).rejects.toThrow('not approved')
    expect(consumeApproval).toHaveBeenCalledWith('approval-1', 'remove_project')
    expect(runtime.removeProject).not.toHaveBeenCalled()
  })

  it('clones into the primary site root as a job that reports progress', async () => {
    const { deps, runtime } = harness()
    vi.spyOn(await import('./site-roots-watcher'), 'derivePrimarySiteRoot').mockReturnValue(
      '/Sites'
    )
    const updates: SiteSetupJobUpdate[] = []
    setSiteSetupJobListener((update) => updates.push(update))
    runtime.cloneRepo.mockImplementationOnce(async (_url, destination, _host, onProgress) => {
      onProgress?.({ phase: 'Receiving objects', percent: 40 })
      return { id: 'r-new', path: `${destination}/acme`, displayName: 'acme', kind: 'git' }
    })
    const started = (await writeSiteSetup(deps, 'create-project', 'a', {
      cloneUrl: 'git@bitbucket.org:efront/acme.git'
    })) as { job_id: string }
    expect(runtime.cloneRepo.mock.calls[0].slice(0, 2)).toEqual([
      'git@bitbucket.org:efront/acme.git',
      '/Sites'
    ])
    await vi.waitFor(() => expect(getSiteSetupJob(started.job_id)?.state).toBe('succeeded'))
    expect(getSiteSetupJob(started.job_id)?.result).toMatchObject({
      id: 'r-new',
      path: '/Sites/acme'
    })
    expect(updates.map((update) => [update.label, update.state, update.percent])).toEqual([
      ['Cloning acme', 'running', null],
      ['Cloning acme', 'running', 40],
      ['Cloning acme', 'succeeded', 40]
    ])
    setSiteSetupJobListener(null)
  })

  it('registers a site linked to the project at the same path, and reuses it next time', async () => {
    const { deps, sites, changed } = harness()
    const first = await writeSiteSetup(deps, 'register-site', 'a', { path: '/Sites/acme' })
    expect(first).toMatchObject({ repo_id: 'r1', adopted: false, name: 'acme' })
    const again = await writeSiteSetup(deps, 'register-site', 'b', { path: '/Sites/acme' })
    expect(again).toMatchObject({ adopted: true })
    expect(sites).toHaveLength(1)
    expect(changed).toHaveLength(2)
    // Saved straight away so the MCP process, which reads sites from disk, sees the new site.
    expect(deps.store.flushOrThrow).toHaveBeenCalledTimes(2)
  })

  it('sets a favicon icon and a new name on a project', async () => {
    const fetchFavicon = vi.fn(async () => ({
      ok: true as const,
      dataUrl: 'data:image/png;base64,AA'
    }))
    const { deps, runtime } = harness({ fetchFavicon })
    await writeSiteSetup(deps, 'update-project', 'a', {
      repo: 'r1',
      name: 'Acme Co',
      faviconDomain: 'acme.com'
    })
    expect(fetchFavicon).toHaveBeenCalledWith('acme.com')
    expect(runtime.updateRepo).toHaveBeenCalledWith('r1', {
      displayName: 'Acme Co',
      repoIcon: {
        type: 'image',
        src: 'data:image/png;base64,AA',
        source: 'favicon',
        label: 'Website favicon'
      }
    })
  })

  it('reports a favicon that cannot be fetched instead of clearing the icon', async () => {
    const fetchFavicon = vi.fn(async () => ({ ok: false as const, error: 'not found' }))
    const { deps, runtime } = harness({ fetchFavicon })
    await expect(
      writeSiteSetup(deps, 'update-project', 'a', { repo: 'r1', faviconDomain: 'nope.test' })
    ).rejects.toThrow('not found')
    expect(runtime.updateRepo).not.toHaveBeenCalled()
  })

  it('refuses a relative path as a caller mistake', async () => {
    const { deps } = harness()
    await expect(
      writeSiteSetup(deps, 'add-site-root', 'a', { path: 'Sites' })
    ).rejects.toBeInstanceOf(TypeError)
  })

  it('starts a local stack job with a generated admin password it never returns', async () => {
    const { deps, sites } = harness()
    await writeSiteSetup(deps, 'register-site', 'a', { path: '/Sites/acme' })
    const result = (await writeSiteSetup(deps, 'set-up-local-site', 'b', {
      siteId: sites[0].id,
      stack: 'localwp',
      domain: 'acme.local',
      adminEmail: 'dev@example.com'
    })) as { job_id: string }
    expect(result).toEqual({ job_id: expect.any(String) })
    const stackArgs = vi.mocked(deps.runStackSetup).mock.calls[0][0]
    expect(stackArgs).toMatchObject({ stack: 'localwp', domain: 'acme.local', force: false })
    expect(String(stackArgs.adminPassword).length).toBeGreaterThan(16)
    expect(JSON.stringify(result)).not.toContain(String(stackArgs.adminPassword))
  })

  it('refuses to set up a stack over one that already serves the site', async () => {
    const detectStack = vi.fn(async () => ({ stack: 'ddev', registered: true }) as never)
    const { deps, sites } = harness({ detectStack })
    await writeSiteSetup(deps, 'register-site', 'a', { path: '/Sites/acme' })
    await expect(
      writeSiteSetup(deps, 'set-up-local-site', 'b', {
        siteId: sites[0].id,
        stack: 'agent-local',
        domain: 'acme.test'
      })
    ).rejects.toThrow('already serves')
    expect(deps.runStackSetup).not.toHaveBeenCalled()
  })

  it('stages a bind link without spending an approval, since Muster prompts for it', async () => {
    const consumeApproval = vi.fn(() => false)
    const { deps } = harness({ consumeApproval })
    await writeSiteSetup(deps, 'stage-bind-link', 'none', { url: 'muster://configure?x=1' })
    expect(deps.stageBindLink).toHaveBeenCalledWith('muster://configure?x=1')
    expect(consumeApproval).not.toHaveBeenCalled()
    await expect(
      writeSiteSetup(deps, 'stage-bind-link', 'none', { url: 'https://evil.test' })
    ).rejects.toBeInstanceOf(TypeError)
  })

  it('refreshes the sidebar after an ocsites import', async () => {
    const { deps } = harness()
    expect(await writeSiteSetup(deps, 'import-ocsites', 'a', {})).toEqual({ created: 2 })
    expect(deps.onSitesAdded).toHaveBeenCalled()
  })
})
