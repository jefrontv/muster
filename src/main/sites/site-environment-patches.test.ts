import { describe, expect, it } from 'vitest'
import { createEmptySiteEnvironment, type SiteEnvironment } from '../../shared/site-types'
import { applyEnvironmentPatches, SiteEnvironmentPatchError } from './site-environment-patches'

function env(hostname: string): SiteEnvironment {
  return { ...createEmptySiteEnvironment(), hostname }
}

describe('applyEnvironmentPatches', () => {
  const current = { main: env('main.example'), staging: env('staging.example') }

  it('merges into the live record, leaving fields the patch does not name alone', () => {
    const live = { ...current, main: { ...current.main, username: 'set-in-the-gui' } }
    const next = applyEnvironmentPatches(live, { main: { merge: { hostname: 'new.example' } } })
    expect(next.main).toMatchObject({ hostname: 'new.example', username: 'set-in-the-gui' })
    expect(next.staging).toBe(live.staging)
  })

  it('refuses to merge into an environment deleted since the caller read it', () => {
    expect(() => applyEnvironmentPatches(current, { gone: { merge: { hostname: 'x' } } })).toThrow(
      SiteEnvironmentPatchError
    )
  })

  it('creates, removes, and renames in place', () => {
    const next = applyEnvironmentPatches(current, {
      dev: { create: env('dev.example') },
      production: { rename: 'main' },
      staging: { remove: true }
    })
    expect(Object.keys(next)).toEqual(['production', 'dev'])
    expect(next.production?.hostname).toBe('main.example')
  })

  it('refuses a create or rename onto a name that exists', () => {
    expect(() => applyEnvironmentPatches(current, { main: { create: env('x') } })).toThrow(
      "Environment 'main' already exists."
    )
    expect(() => applyEnvironmentPatches(current, { staging: { rename: 'main' } })).toThrow(
      "Environment 'staging' already exists."
    )
  })
})
