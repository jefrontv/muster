import { describe, expect, it } from 'vitest'
import {
  createEmptySiteEnvironment,
  resolveSiteEnvironment,
  resolveSiteSshPort,
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

describe('resolveSiteSshPort', () => {
  it('uses the SSH default when unset or unusable', () => {
    expect(resolveSiteSshPort('')).toBe(22)
    expect(resolveSiteSshPort(undefined)).toBe(22)
    expect(resolveSiteSshPort('  ')).toBe(22)
    expect(resolveSiteSshPort('http')).toBe(22)
    // Out of range on both ends, so a typo cannot dial port 0 or overflow.
    expect(resolveSiteSshPort('0')).toBe(22)
    expect(resolveSiteSshPort('70000')).toBe(22)
  })

  it('takes a configured port, trimmed', () => {
    expect(resolveSiteSshPort('2222')).toBe(2222)
    expect(resolveSiteSshPort(' 2200 ')).toBe(2200)
    expect(resolveSiteSshPort('65535')).toBe(65535)
  })
})

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
