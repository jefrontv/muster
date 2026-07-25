import { describe, expect, it } from 'vitest'
import {
  createEmptySiteEnvironment,
  type Site,
  type SiteEnvironment
} from '../../shared/site-types'
import { buildSiteRunPlan, canStartRun } from './site-run-plan'

function environment(overrides: Partial<SiteEnvironment> = {}): SiteEnvironment {
  return { ...createEmptySiteEnvironment(), hostname: 'host.example.com', ...overrides }
}

function site(environments: Record<string, SiteEnvironment>, activeEnvironment = 'main'): Site {
  return {
    id: 'site-1',
    path: '/Sites/acme',
    repoId: null,
    displayName: 'acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment,
    environments,
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
}

const alwaysHasSecret = (): boolean => true
const neverHasSecret = (): boolean => false

describe('buildSiteRunPlan', () => {
  it('lists every step for the group, marking disabled ones rather than hiding them', () => {
    const plan = buildSiteRunPlan({
      site: site({ main: environment({ exportDatabase: true }) }),
      group: 'import',
      branch: 'main',
      hasSshSecret: alwaysHasSecret,
      pathExists: true
    })
    expect(plan.steps.map((step) => step.key)).toEqual([
      'exportDatabase',
      'exportFiles',
      'wpUploadRewrite',
      'wpSearchReplace'
    ])
    expect(plan.steps.filter((step) => step.enabled)).toHaveLength(1)
    expect(plan.enabledStepCount).toBe(1)
  })

  it('does not require a remote host for a local-only run', () => {
    const plan = buildSiteRunPlan({
      site: site({ main: environment({ wpSearchReplace: true, wpUploadRewrite: true }) }),
      group: 'import',
      branch: 'main',
      hasSshSecret: neverHasSecret,
      pathExists: true
    })
    expect(plan.requiresRemote).toBe(false)
    expect(plan.blockedBy).toEqual([])
    expect(canStartRun(plan, false)).toBe(true)
  })

  it('blocks a remote run with no stored ssh password', () => {
    const plan = buildSiteRunPlan({
      site: site({ main: environment({ exportDatabase: true }) }),
      group: 'import',
      branch: 'main',
      hasSshSecret: neverHasSecret,
      pathExists: true
    })
    expect(plan.requiresRemote).toBe(true)
    expect(plan.blockedBy).toContain('missing-ssh-credentials')
    expect(canStartRun(plan, true)).toBe(false)
  })

  it('blocks when the branch matches no environment, and a confirm overrides it', () => {
    const plan = buildSiteRunPlan({
      site: site({ production: environment({ deployThemes: true }) }, 'production'),
      group: 'deploy',
      branch: 'feature/x',
      hasSshSecret: alwaysHasSecret,
      pathExists: true
    })
    expect(plan.environment).toBe('production')
    expect(plan.blockedBy).toEqual(['unmatched-branch'])
    expect(plan.confirmable).toBe(true)
    expect(canStartRun(plan, false)).toBe(false)
    expect(canStartRun(plan, true)).toBe(true)
  })

  it('does not trip the branch guard when an environment is named explicitly', () => {
    const plan = buildSiteRunPlan({
      site: site({ production: environment({ deployThemes: true }) }, 'production'),
      group: 'deploy',
      branch: 'feature/x',
      requestedEnvironment: 'production',
      hasSshSecret: alwaysHasSecret,
      pathExists: true
    })
    expect(plan.blockedBy).toEqual([])
    expect(canStartRun(plan, false)).toBe(true)
  })

  it('a confirm never overrides anything except an unmatched branch', () => {
    const plan = buildSiteRunPlan({
      site: site({ production: environment({ deployThemes: true }) }, 'production'),
      group: 'deploy',
      branch: 'feature/x',
      hasSshSecret: neverHasSecret,
      pathExists: true
    })
    expect(plan.blockedBy).toEqual(
      expect.arrayContaining(['missing-ssh-credentials', 'unmatched-branch'])
    )
    expect(plan.confirmable).toBe(false)
    expect(canStartRun(plan, true)).toBe(false)
  })

  it('blocks a run with no steps selected', () => {
    const plan = buildSiteRunPlan({
      site: site({ main: environment() }),
      group: 'deploy',
      branch: 'main',
      hasSshSecret: alwaysHasSecret,
      pathExists: true
    })
    expect(plan.blockedBy).toContain('no-steps-selected')
    expect(canStartRun(plan, true)).toBe(false)
  })

  it('blocks when the checkout folder is gone', () => {
    const plan = buildSiteRunPlan({
      site: site({ main: environment({ exportDatabase: true }) }),
      group: 'import',
      branch: 'main',
      hasSshSecret: alwaysHasSecret,
      pathExists: false
    })
    expect(plan.blockedBy).toContain('missing-path')
  })

  it('blocks a site with no environments at all', () => {
    const plan = buildSiteRunPlan({
      site: site({}, ''),
      group: 'import',
      branch: null,
      hasSshSecret: alwaysHasSecret,
      pathExists: true
    })
    expect(plan.environment).toBeNull()
    expect(plan.blockedBy).toEqual(expect.arrayContaining(['no-environment', 'no-steps-selected']))
  })

  it('prefers an exact branch match over the main fallback', () => {
    const plan = buildSiteRunPlan({
      site: site(
        { main: environment({ deployThemes: true }), staging: environment({ deployThemes: true }) },
        'main'
      ),
      group: 'deploy',
      branch: 'staging',
      hasSshSecret: alwaysHasSecret,
      pathExists: true
    })
    expect(plan.environment).toBe('staging')
    expect(plan.resolution.reason).toBe('branch-match')
    expect(plan.blockedBy).toEqual([])
  })
})
