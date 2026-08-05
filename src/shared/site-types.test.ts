import { describe, expect, it } from 'vitest'
import {
  createEmptySiteEnvironment,
  resolveSiteEnvironment,
  type Site,
  type SiteEnvironment
} from './site-types'

function site(
  environmentNames: string[],
  activeEnvironment: string
): Pick<Site, 'environments' | 'activeEnvironment'> {
  const environments: Record<string, SiteEnvironment> = {}
  for (const name of environmentNames) {
    environments[name] = createEmptySiteEnvironment()
  }
  return { environments, activeEnvironment }
}

describe('resolveSiteEnvironment', () => {
  it('prefers an exact branch match, the only case that needs no confirmation', () => {
    const resolution = resolveSiteEnvironment(site(['main', 'master'], 'main'), 'master')
    expect(resolution).toEqual({
      environment: 'master',
      reason: 'branch-match',
      requiresConfirmation: false
    })
  })

  // Why: a bind link names its target environment and stores it here. Preferring 'main' meant the
  // detail pane edited 'main' while the link's data sat in the selected environment.
  it("uses the site's selected environment when no branch matches, even though 'main' exists", () => {
    const resolution = resolveSiteEnvironment(site(['main', 'master'], 'master'), null)
    expect(resolution).toEqual({
      environment: 'master',
      reason: 'active-environment',
      requiresConfirmation: true
    })
  })

  it('still requires confirmation for a selected environment, since the branch did not match', () => {
    const resolution = resolveSiteEnvironment(site(['main', 'staging'], 'staging'), 'feature/x')
    expect(resolution.environment).toBe('staging')
    expect(resolution.requiresConfirmation).toBe(true)
  })

  it("falls back to 'main' when the selected environment no longer exists", () => {
    const resolution = resolveSiteEnvironment(site(['main', 'staging'], 'deleted'), null)
    expect(resolution).toEqual({
      environment: 'main',
      reason: 'default-main',
      requiresConfirmation: true
    })
  })

  it("falls back to 'main' when nothing is selected", () => {
    const resolution = resolveSiteEnvironment(site(['main', 'staging'], ''), null)
    expect(resolution.environment).toBe('main')
    expect(resolution.reason).toBe('default-main')
  })

  it('falls back to the first environment when there is no match and no main', () => {
    const resolution = resolveSiteEnvironment(site(['staging', 'prod'], 'gone'), null)
    expect(resolution).toEqual({
      environment: 'staging',
      reason: 'first-environment',
      requiresConfirmation: true
    })
  })

  it('reports no environments rather than inventing one', () => {
    const resolution = resolveSiteEnvironment(site([], 'main'), 'main')
    expect(resolution).toEqual({
      environment: null,
      reason: 'no-environments',
      requiresConfirmation: true
    })
  })
})
