import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteSetupCloneResolution, SiteSetupStageId } from '../../shared/site-setup-flow-types'
import type { LocalWpStackDetection } from '../../shared/site-stack-types'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment
} from '../../shared/site-types'
import type { Store } from '../persistence'

const { detectSiteStack, resolveSiteSetupCloneTargets, getSiteSecretPresence } = vi.hoisted(
  () => ({
    detectSiteStack: vi.fn(),
    resolveSiteSetupCloneTargets: vi.fn(),
    getSiteSecretPresence: vi.fn()
  })
)

vi.mock('./local-stack-detection', () => ({ detectSiteStack }))
vi.mock('./site-setup-clone-targets', () => ({ resolveSiteSetupCloneTargets }))
// Mocked for the seam, not just the electron dependency: "is an SSH password stored" is the input
// that decides whether the import stage blocks.
vi.mock('./site-secret-store', () => ({ getSiteSecretPresence }))

import { buildSiteSetupPlan } from './site-setup-plan'

const SITE_ID = 'site-1'
const NO_CLONE_TARGETS: SiteSetupCloneResolution = {
  connectorConfigured: false,
  targets: [],
  error: ''
}

// A real directory, so the `target` stage and the run planner see a checkout that genuinely exists.
const EXISTING_PATH = mkdtempSync(path.join(tmpdir(), 'muster-setup-plan-'))
const MISSING_PATH = path.join(EXISTING_PATH, 'not-cloned-yet')

afterAll(() => {
  rmSync(EXISTING_PATH, { recursive: true, force: true })
})

function detection(overrides: Partial<LocalWpStackDetection> = {}): LocalWpStackDetection {
  return {
    supported: true,
    reason: '',
    stack: 'plain',
    appRunning: false,
    registered: false,
    siteId: '',
    socketPath: '',
    socketReady: false,
    phpVersion: '',
    ...overrides
  }
}

function environment(overrides: Partial<SiteEnvironment> = {}): SiteEnvironment {
  return { ...createEmptySiteEnvironment(), hostname: 'acme.example.com', ...overrides }
}

function site(overrides: Partial<Site> = {}): Site {
  return {
    id: SITE_ID,
    path: EXISTING_PATH,
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: 'main',
    // Local-only import step: no SSH password needed, so the default fixture is import-ready.
    environments: { main: environment({ wpSearchReplace: true }) },
    notes: '',
    searchReplaceTimeoutSeconds: 600,
    ...overrides
  }
}

function storeStub(record: Site | null = site()): Store {
  return {
    getSite: (id: string) => (record && id === record.id ? record : null)
  } as unknown as Store
}

function stageState(
  stages: { id: SiteSetupStageId; state: string }[],
  id: SiteSetupStageId
): string {
  return stages.find((stage) => stage.id === id)?.state ?? 'absent'
}

function stageReason(
  stages: { id: SiteSetupStageId; reason: string }[],
  id: SiteSetupStageId
): string {
  return stages.find((stage) => stage.id === id)?.reason ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  detectSiteStack.mockResolvedValue(detection())
  resolveSiteSetupCloneTargets.mockResolvedValue(NO_CLONE_TARGETS)
  getSiteSecretPresence.mockReturnValue({ ssh: false, db: false })
})

describe('buildSiteSetupPlan', () => {
  it('refuses a site the store does not know rather than planning against nothing', async () => {
    await expect(
      buildSiteSetupPlan(storeStub(null), { siteId: SITE_ID, reponame: 'acme', branch: 'main' })
    ).rejects.toThrow(/site-1/)
  })

  it('offers the stack and the import for a macOS plain-WordPress checkout that is ready', async () => {
    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(plan.siteId).toBe(SITE_ID)
    expect(plan.stages.map((stage) => [stage.id, stage.state])).toEqual([
      ['target', 'done'],
      ['bind', 'done'],
      ['stack', 'pending'],
      ['import', 'pending']
    ])
    expect(plan.stages.every((stage) => stage.reason === '')).toBe(true)
    expect(plan.stack).toEqual({
      supported: true,
      alreadyLocalWp: false,
      stack: 'plain',
      suggestedDomain: 'acme.local',
      reason: ''
    })
    expect(plan.import).toEqual({
      ready: true,
      blockedBy: [],
      confirmable: false,
      environment: 'main',
      enabledStepCount: 1
    })
  })

  it('marks the target stage active when the checkout is not on disk yet', async () => {
    const plan = await buildSiteSetupPlan(storeStub(site({ path: MISSING_PATH })), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(stageState(plan.stages, 'target')).toBe('active')
    // A missing checkout also stops the import, which is the planner refusing to offer a run the
    // run planner would reject.
    expect(plan.import.blockedBy).toContain('missing-path')
    expect(stageReason(plan.stages, 'import')).toContain('not on disk')
  })

  it('falls back to the folder name when the site has no local domain', async () => {
    const plan = await buildSiteSetupPlan(storeStub(site({ localDomain: '  ' })), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    // ocsites' default_local_domain: lower-cased, and only the first label survives.
    expect(plan.stack.suggestedDomain).toBe(`${path.basename(EXISTING_PATH).toLowerCase()}.local`)
  })

  it('keeps only the first label of a domain-shaped folder name, as ocsites does', async () => {
    const plan = await buildSiteSetupPlan(
      storeStub(site({ localDomain: '', path: '/Sites/ttiwatertrucks.com.au' })),
      { siteId: SITE_ID, reponame: 'acme', branch: 'main' }
    )

    expect(plan.stack.suggestedDomain).toBe('ttiwatertrucks.local')
  })

  it('closes the stack stage off macOS, where LocalWP cannot be driven at all', async () => {
    detectSiteStack.mockResolvedValue(
      detection({ supported: false, reason: 'LocalWP integration is only available on macOS.' })
    )

    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(stageState(plan.stages, 'stack')).toBe('unavailable')
    expect(stageReason(plan.stages, 'stack')).toBe(
      'LocalWP integration is only available on macOS.'
    )
    expect(plan.stack.supported).toBe(false)
    expect(plan.stack.alreadyLocalWp).toBe(false)
    // The other stages are independent of the platform and must still be offered.
    expect(stageState(plan.stages, 'import')).toBe('pending')
  })

  it('closes the stack stage when the checkout is already a LocalWP site', async () => {
    detectSiteStack.mockResolvedValue(detection({ stack: 'localwp', registered: true }))

    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(stageState(plan.stages, 'stack')).toBe('unavailable')
    expect(stageReason(plan.stages, 'stack')).toBe('This project is already a LocalWP site.')
    expect(plan.stack).toMatchObject({ supported: true, alreadyLocalWp: true })
  })

  // The bug this pins: the planner asked only LocalWP, so a folder Agent Local already served came
  // back `plain` and the wizard offered to set up a site that was already set up.
  it('closes the stack stage when the checkout is already an Agent Local site', async () => {
    detectSiteStack.mockResolvedValue(detection({ stack: 'agent-local', registered: true }))

    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(stageState(plan.stages, 'stack')).toBe('unavailable')
    // Naming the wrong stack here reads as a detection bug to anyone who knows their own setup.
    expect(stageReason(plan.stages, 'stack')).toBe('This project is already an Agent Local site.')
    expect(plan.stack).toMatchObject({ supported: true, alreadyLocalWp: true, stack: 'agent-local' })
  })

  it('reports the detected stack so the picker can open on it', async () => {
    detectSiteStack.mockResolvedValue(detection({ stack: 'plain' }))

    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(stageState(plan.stages, 'stack')).toBe('pending')
    expect(plan.stack.stack).toBe('plain')
  })

  it('blocks the import with an actionable reason when the SSH password is missing', async () => {
    const store = storeStub(site({ environments: { main: environment({ exportDatabase: true }) } }))

    const plan = await buildSiteSetupPlan(store, {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(plan.import).toEqual({
      ready: false,
      blockedBy: ['missing-ssh-credentials'],
      // A missing credential is not a branch mismatch, so no confirm can override it.
      confirmable: false,
      environment: 'main',
      enabledStepCount: 1
    })
    expect(stageState(plan.stages, 'import')).toBe('blocked')
    expect(stageReason(plan.stages, 'import')).toBe(
      'Add the SSH password for this environment before importing.'
    )
  })

  it('unblocks that same import once the password is stored', async () => {
    getSiteSecretPresence.mockReturnValue({ ssh: true, db: false })
    const store = storeStub(site({ environments: { main: environment({ exportDatabase: true }) } }))

    const plan = await buildSiteSetupPlan(store, {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(plan.import.ready).toBe(true)
    expect(stageState(plan.stages, 'import')).toBe('pending')
  })

  it('flags an unmatched branch as confirmable rather than fatal', async () => {
    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'feature/x'
    })

    expect(plan.import.blockedBy).toEqual(['unmatched-branch'])
    expect(plan.import.confirmable).toBe(true)
    expect(stageReason(plan.stages, 'import')).toContain('confirm the target')
  })

  it('degrades a throwing clone connector to "no targets" instead of failing the plan', async () => {
    resolveSiteSetupCloneTargets.mockRejectedValue(new Error('Bitbucket returned 401.'))

    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'acme',
      branch: 'main'
    })

    expect(plan.clone).toEqual({
      connectorConfigured: false,
      targets: [],
      error: 'Bitbucket returned 401.'
    })
    // The point of degrading: every other stage is still answered.
    expect(plan.stages.map((stage) => [stage.id, stage.state])).toEqual([
      ['target', 'done'],
      ['bind', 'done'],
      ['stack', 'pending'],
      ['import', 'pending']
    ])
  })

  it('passes the link reponame straight through to the connector', async () => {
    resolveSiteSetupCloneTargets.mockResolvedValue({
      connectorConfigured: true,
      targets: [
        {
          provider: 'bitbucket',
          fullName: 'efront_au/acme',
          cloneUrl: 'git@bitbucket.org:efront_au/acme.git',
          exactMatch: true
        }
      ],
      error: ''
    } satisfies SiteSetupCloneResolution)

    const plan = await buildSiteSetupPlan(storeStub(), {
      siteId: SITE_ID,
      reponame: 'efront_au/acme',
      branch: 'main'
    })

    expect(resolveSiteSetupCloneTargets).toHaveBeenCalledWith('efront_au/acme')
    expect(plan.clone.targets).toHaveLength(1)
  })
})
