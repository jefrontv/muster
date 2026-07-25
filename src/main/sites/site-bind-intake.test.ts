import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_ENVIRONMENT_NAME, type Site } from '../../shared/site-types'
import { createSiteBindIntake, type SiteBindIntake } from './site-bind-intake'
import { generateSiteBindUrl } from './site-bind-url'

const LINK = generateSiteBindUrl({
  reponame: 'efront_au/acme',
  hostname: 'dedicated-11.example.com',
  username: 'acme',
  rootPath: 'public_html',
  liveDomain: 'acme.com.au',
  liveDomainProtocol: 'https',
  environment: 'staging',
  deployCommand: 'npm run build',
  themeDistPath: 'wp-content/themes/acme/dist',
  notes: 'from the dashboard',
  password: 'hunter2'
})

type StoredSecret = { siteId: string; environment: string; password: string }

type Harness = {
  intake: SiteBindIntake
  sites: Site[]
  secrets: StoredSecret[]
  missingPaths: Set<string>
  secretFailure: { message: string } | null
}

function existingSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'acme',
    localWpRoot: '',
    localDomain: '',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: DEFAULT_SITE_ENVIRONMENT_NAME,
    environments: {},
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    ...overrides
  }
}

function harness(
  options: { sites?: Site[]; repos?: { id: string; path: string }[] } = {}
): Harness {
  const state: Harness = {
    intake: null as unknown as SiteBindIntake,
    sites: options.sites ?? [],
    secrets: [],
    missingPaths: new Set<string>(),
    secretFailure: null
  }
  let counter = 0
  state.intake = createSiteBindIntake({
    store: {
      listSites: () => state.sites,
      getRepos: () =>
        (options.repos ?? []).map((repo) => ({
          id: repo.id,
          path: repo.path,
          displayName: repo.path
        })),
      findSiteByPath: (sitePath) => state.sites.find((site) => site.path === sitePath) ?? null,
      upsertSite: (site) => {
        const index = state.sites.findIndex((entry) => entry.id === site.id)
        state.sites = index === -1 ? [...state.sites, site] : state.sites.with(index, site)
        return site
      }
    },
    directoryExists: (candidatePath) => !state.missingPaths.has(candidatePath),
    storeSecret: (siteId, environment, password) => {
      if (state.secretFailure) {
        throw new Error(state.secretFailure.message)
      }
      state.secrets.push({ siteId, environment, password })
    },
    newId: () => {
      counter += 1
      return `generated-${counter}`
    },
    now: () => 1_700_000_000_000
  })
  return state
}

describe('receive', () => {
  it('stages a pending request without writing anything', () => {
    const state = harness()
    const received = state.intake.receive(LINK)
    expect(received.ok).toBe(true)
    expect(state.sites).toEqual([])
    expect(state.secrets).toEqual([])

    const pending = state.intake.getPending()
    expect(pending).toMatchObject({
      receivedAt: 1_700_000_000_000,
      passwordProvided: true,
      suggestedCloneUrl: 'git@bitbucket.org:efront_au/acme.git'
    })
    expect(pending?.fields.localDomain).toBe('acme.local')
  })

  it('keeps the password out of the pending payload', () => {
    const state = harness()
    state.intake.receive(LINK)
    expect(JSON.stringify(state.intake.getPending())).not.toContain('hunter2')
  })

  it('surfaces the parse error and leaves nothing pending', () => {
    const state = harness()
    expect(state.intake.receive('muster://configure?reponame=acme')).toEqual({
      ok: false,
      error: 'The link is missing required parameters: hostname, username.'
    })
    expect(state.intake.getPending()).toBeNull()
  })

  it('offers matching sites and repos as candidates', () => {
    const state = harness({
      sites: [existingSite(), existingSite({ id: 'site-2', path: '/Sites/other' })],
      repos: [
        { id: 'repo-1', path: '/Sites/acme' },
        { id: 'repo-2', path: '/Volumes/repos/acme' }
      ]
    })
    state.intake.receive(LINK)
    const candidates = state.intake.getPending()?.candidates ?? []
    expect(candidates.map((entry) => entry.path)).toEqual(['/Sites/acme', '/Volumes/repos/acme'])
    expect(candidates[0]).toMatchObject({ siteId: 'site-1', repoId: 'repo-1' })
    expect(candidates[1]).toMatchObject({ siteId: null, repoId: 'repo-2' })
  })
})

describe('confirm', () => {
  it('creates the site, the environment, and the stored secret', () => {
    const state = harness()
    const pending = state.intake.receive(LINK)
    const requestId = pending.ok ? pending.pending.requestId : ''

    const applied = state.intake.confirm(requestId, '/Sites/acme')
    expect(applied).toMatchObject({
      path: '/Sites/acme',
      environment: 'staging',
      created: true,
      secretStored: true,
      secretError: ''
    })
    expect(state.secrets).toEqual([
      { siteId: applied.siteId, environment: 'staging', password: 'hunter2' }
    ])

    const saved = state.sites[0]
    expect(saved.activeEnvironment).toBe('staging')
    expect(saved.localDomain).toBe('acme.local')
    expect(saved.notes).toBe('from the dashboard')
    expect(saved.environments.staging).toMatchObject({
      hostname: 'dedicated-11.example.com',
      username: 'acme',
      rootPath: 'public_html',
      liveDomain: 'acme.com.au',
      deployCommand: 'npm run build',
      themeDistPath: 'wp-content/themes/acme/dist',
      exportDatabase: false
    })
  })

  it('updates an existing site and preserves its local domain and toggles', () => {
    const state = harness({
      sites: [
        existingSite({
          localDomain: 'chosen-by-hand.local',
          notes: 'keep me',
          environments: {
            staging: {
              hostname: 'old.example.com',
              username: 'old',
              rootPath: 'old_root',
              liveDomain: 'old.com',
              liveDomainProtocol: 'http',
              deployCommand: '',
              themeDistPath: '',
              exportDatabase: true,
              exportFiles: true,
              wpSearchReplace: false,
              wpUploadRewrite: false,
              gitPullOnServer: false,
              clearServerCache: true,
              deployThemes: false
            }
          }
        })
      ]
    })
    const pending = state.intake.receive(LINK)
    const applied = state.intake.confirm(pending.ok ? pending.pending.requestId : '', '/Sites/acme')

    expect(applied).toMatchObject({ siteId: 'site-1', created: false })
    expect(state.sites).toHaveLength(1)
    const saved = state.sites[0]
    expect(saved.localDomain).toBe('chosen-by-hand.local')
    expect(saved.notes).toBe('keep me')
    expect(saved.environments.staging).toMatchObject({
      hostname: 'dedicated-11.example.com',
      liveDomainProtocol: 'https',
      exportDatabase: true,
      clearServerCache: true
    })
  })

  it('falls back to the default environment name when the link names none', () => {
    const state = harness()
    const url = generateSiteBindUrl({ hostname: 'h.example.com', username: 'bob' })
    const pending = state.intake.receive(url)
    const applied = state.intake.confirm(pending.ok ? pending.pending.requestId : '', '/Sites/acme')
    expect(applied.environment).toBe(DEFAULT_SITE_ENVIRONMENT_NAME)
  })

  it('links the repo of the chosen candidate', () => {
    const state = harness({ repos: [{ id: 'repo-1', path: '/Sites/acme' }] })
    const pending = state.intake.receive(LINK)
    state.intake.confirm(pending.ok ? pending.pending.requestId : '', '/Sites/acme')
    expect(state.sites[0].repoId).toBe('repo-1')
  })

  it('records a keychain failure without leaking the password', () => {
    const state = harness()
    state.secretFailure = { message: 'OS encryption is unavailable' }
    const pending = state.intake.receive(LINK)
    const applied = state.intake.confirm(pending.ok ? pending.pending.requestId : '', '/Sites/acme')
    expect(applied).toMatchObject({ secretStored: false, created: true })
    expect(applied.secretError).toBe('OS encryption is unavailable')
    expect(JSON.stringify(applied)).not.toContain('hunter2')
  })

  it('rejects a stale request, a relative path, and a missing folder', () => {
    const state = harness()
    const pending = state.intake.receive(LINK)
    const requestId = pending.ok ? pending.pending.requestId : ''

    expect(() => state.intake.confirm('other-id', '/Sites/acme')).toThrow(
      'That bind request is no longer pending.'
    )
    expect(() => state.intake.confirm(requestId, 'Sites/acme')).toThrow(
      'Choose an absolute folder to bind.'
    )
    state.missingPaths.add('/Sites/gone')
    expect(() => state.intake.confirm(requestId, '/Sites/gone')).toThrow(
      'That folder does not exist yet: /Sites/gone'
    )
  })

  it('never repeats a confirm, and never echoes the password when it fails', () => {
    const state = harness()
    const pending = state.intake.receive(LINK)
    const requestId = pending.ok ? pending.pending.requestId : ''
    state.intake.confirm(requestId, '/Sites/acme')

    let message = ''
    try {
      state.intake.confirm(requestId, '/Sites/acme')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toBe('That bind request is no longer pending.')
    expect(message).not.toContain('hunter2')
    expect(state.secrets).toHaveLength(1)
  })
})

describe('dismiss', () => {
  it('drops the pending request and its password', () => {
    const state = harness()
    const pending = state.intake.receive(LINK)
    const requestId = pending.ok ? pending.pending.requestId : ''

    state.intake.dismiss('some-other-id')
    expect(state.intake.getPending()).not.toBeNull()

    state.intake.dismiss(requestId)
    expect(state.intake.getPending()).toBeNull()
    expect(() => state.intake.confirm(requestId, '/Sites/acme')).toThrow(
      'That bind request is no longer pending.'
    )
  })

  it('drops whatever is pending when no id is given', () => {
    const state = harness()
    state.intake.receive(LINK)
    state.intake.dismiss()
    expect(state.intake.getPending()).toBeNull()
  })
})
