import { describe, expect, it } from 'vitest'
import {
  activeCollabProjectSiteKey,
  sanitizeActiveCollabProjectSites
} from './activecollab-project-site'

describe('activeCollabProjectSiteKey', () => {
  it('scopes a project id to its instance', () => {
    expect(activeCollabProjectSiteKey('https://projects.efront.com.au', 5937)).toBe(
      'https://projects.efront.com.au::5937'
    )
  })

  it('keeps two instances apart for the same project id', () => {
    expect(activeCollabProjectSiteKey('https://a.example', 1)).not.toBe(
      activeCollabProjectSiteKey('https://b.example', 1)
    )
  })

  it('never emits an empty segment when the instance is unknown', () => {
    // A blank instance would make "::5937", which collides with every other unknown-instance
    // project and reads as a valid key. The placeholder keeps keys total and greppable.
    expect(activeCollabProjectSiteKey(null, 5937)).toBe('unknown-instance::5937')
    expect(activeCollabProjectSiteKey('   ', 5937)).toBe('unknown-instance::5937')
  })

  it('ignores a trailing slash so one instance cannot produce two keys', () => {
    expect(activeCollabProjectSiteKey('https://a.example/', 7)).toBe(
      activeCollabProjectSiteKey('https://a.example', 7)
    )
  })
})

describe('sanitizeActiveCollabProjectSites', () => {
  it('keeps well-formed string pairs', () => {
    expect(sanitizeActiveCollabProjectSites({ 'https://a.example::1': 'site-1' })).toEqual({
      'https://a.example::1': 'site-1'
    })
  })

  it('drops entries that are not string-to-string', () => {
    // This is disk data a user can hand-edit, so a non-string value must not reach a Site lookup.
    expect(
      sanitizeActiveCollabProjectSites({ a: 1, b: null, c: {}, d: 'site-1', '': 'site-2' })
    ).toEqual({ d: 'site-1' })
  })

  it('answers an empty map for anything that is not an object', () => {
    expect(sanitizeActiveCollabProjectSites(undefined)).toEqual({})
    expect(sanitizeActiveCollabProjectSites('nope')).toEqual({})
    expect(sanitizeActiveCollabProjectSites([])).toEqual({})
  })
})
