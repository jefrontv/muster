import { describe, expect, it } from 'vitest'
import { getDevInstanceIdentity } from './dev-instance-identity'

describe('dev-instance-identity', () => {
  it('keeps packaged identity stable', () => {
    expect(getDevInstanceIdentity(false, {})).toMatchObject({
      name: 'Muster',
      appName: 'Muster',
      isDev: false,
      devLabel: null,
      dockBadgeLabel: null,
      appUserModelId: 'au.com.efront.muster'
    })
  })

  it('pins a stable dev appName across branches so the safeStorage key does not churn', () => {
    const a = getDevInstanceIdentity(true, { ORCA_DEV_BRANCH: 'feature/a' })
    const b = getDevInstanceIdentity(true, { ORCA_DEV_BRANCH: 'feature/b' })

    // Per-branch label differs (window title / app menu)...
    expect(a.name).not.toBe(b.name)
    // ...but the Keychain-driving appName is identical and distinct from prod.
    expect(a.appName).toBe('Muster Dev')
    expect(b.appName).toBe('Muster Dev')
    expect(a.appName).not.toBe('Muster')
  })

  it('derives a readable dev label from worktree and branch env', () => {
    const identity = getDevInstanceIdentity(true, {
      ORCA_DEV_REPO_ROOT: '/repo/worktrees/dev-indicator',
      ORCA_DEV_WORKTREE_NAME: 'dev-indicator',
      ORCA_DEV_BRANCH: 'nwparker/dev-indicator'
    })

    expect(identity).toMatchObject({
      isDev: true,
      devLabel: 'dev-indicator',
      devBranch: 'nwparker/dev-indicator',
      devWorktreeName: 'dev-indicator',
      devRepoRoot: '/repo/worktrees/dev-indicator'
    })
    expect(identity.name).toBe('Muster: nwparker/dev-indicator')
    expect(identity.dockBadgeLabel).toBeNull()
    expect(identity.appUserModelId).toMatch(/^au\.com\.efront\.muster\.dev\.[a-f0-9]{10}$/)
  })

  it('includes the branch when it differs from the worktree basename', () => {
    const identity = getDevInstanceIdentity(true, {
      ORCA_DEV_REPO_ROOT: '/repo/worktrees/payment-ui',
      ORCA_DEV_WORKTREE_NAME: 'payment-ui',
      ORCA_DEV_BRANCH: 'feature/billing-shell'
    })

    expect(identity.devLabel).toBe('payment-ui @ feature/billing-shell')
    expect(identity.name).toBe('Muster: feature/billing-shell')
    expect(identity.dockBadgeLabel).toBeNull()
  })

  it('allows an explicit label override', () => {
    const identity = getDevInstanceIdentity(true, {
      ORCA_DEV_INSTANCE_LABEL: 'manual label',
      ORCA_DEV_WORKTREE_NAME: 'dev-indicator',
      ORCA_DEV_BRANCH: 'feature/other'
    })

    expect(identity.devLabel).toBe('manual label')
    expect(identity.name).toBe('Muster: feature/other')
    expect(identity.dockBadgeLabel).toBeNull()
  })
  it('drops the dev suffix when the branch just repeats the product name', () => {
    // Why: the suffix disambiguates concurrent branches. On a branch literally named
    // `muster` it produced "Muster: muster", which reads as a bug in the title bar.
    const identity = getDevInstanceIdentity(true, {
      ORCA_DEV_REPO_ROOT: '/repo/muster-ui',
      ORCA_DEV_WORKTREE_NAME: 'muster-ui',
      ORCA_DEV_BRANCH: 'muster'
    })

    expect(identity.name).toBe('Muster')
    // The branch is still recorded; only the window title drops the redundant half.
    expect(identity.devBranch).toBe('muster')
  })

  it('ignores case when deciding the suffix is redundant', () => {
    expect(getDevInstanceIdentity(true, { ORCA_DEV_BRANCH: 'MUSTER' }).name).toBe('Muster')
  })
})
