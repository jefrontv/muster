import { describe, expect, it } from 'vitest'
import { abbreviateHome, describeFolder } from './folder-display'

describe('describeFolder', () => {
  it('leads with the folder name and abbreviates the home directory in the parent', () => {
    expect(describeFolder('/Users/jake/Documents/Sites/flex')).toEqual({
      name: 'flex',
      parent: '~/Documents/Sites'
    })
  })

  it('keeps the site folder when the leaf is a generic docroot name', () => {
    // `app` alone would make every LocalWP site look identical in a list.
    expect(describeFolder('/Users/jake/Documents/Sites/117pacific/app')).toEqual({
      name: '117pacific/app',
      parent: '~/Documents/Sites'
    })
    expect(describeFolder('/srv/acme/public_html').name).toBe('acme/public_html')
  })

  it('handles a root-level folder and a trailing slash', () => {
    expect(describeFolder('/Sites/')).toEqual({ name: 'Sites', parent: '' })
    expect(describeFolder('/Users/jake/')).toEqual({ name: 'jake', parent: '/Users' })
  })

  it('abbreviates Windows and Linux home directories too', () => {
    expect(abbreviateHome('C:\\Users\\jake\\Sites')).toBe('~\\Sites')
    expect(abbreviateHome('/home/jake/sites')).toBe('~/sites')
    expect(abbreviateHome('/opt/sites')).toBe('/opt/sites')
  })
})
