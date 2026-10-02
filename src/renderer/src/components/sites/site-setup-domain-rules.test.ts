import { describe, expect, it } from 'vitest'
import {
  ddevDomainFromName,
  ddevNameError,
  ddevNameFromValue,
  normalizeDdevName
} from './site-setup-domain-rules'
import { serveSitePath } from './use-serve-domain-check'

describe('DDEV project names', () => {
  it('keeps only the project name of a pasted domain or URL', () => {
    expect(ddevNameFromValue('https://roads-australia.ddev.site:8843/x')).toBe('roads-australia')
    expect(ddevNameFromValue('roads-australia.local')).toBe('roads-australia')
  })

  it('converts as DDEV does instead of rejecting', () => {
    expect(normalizeDdevName('Roads Australia_EDM')).toBe('roads-australia-edm')
    expect(ddevDomainFromName('edm')).toBe('edm.ddev.site')
  })

  it('accepts DDEV names and explains the ones it rejects', () => {
    expect(ddevNameError('roads-australia')).toBe('')
    expect(ddevNameError('')).toBe('Enter a project name.')
    expect(ddevNameError('-edm')).toMatch(/hyphen/)
    expect(ddevNameError('edm!')).toMatch(/letters, digits and hyphens/)
    expect(ddevNameError('a'.repeat(64))).toBe('Use at most 63 characters.')
  })
})

describe('serveSitePath', () => {
  const byId = (id: string) => (id === 's1' ? '/Sites/edm' : '')

  it('uses the folder a clone will create, not its parent', () => {
    const fromLink = serveSitePath(
      {
        kind: 'link',
        pending: {} as never,
        target: { kind: 'clone', root: '/Sites', cloneUrl: 'git@bitbucket.org:efront_au/edm.git' }
      },
      byId
    )
    expect(fromLink).toBe('/Sites/edm')
  })

  it('uses an existing checkout or a registered site as is', () => {
    expect(serveSitePath({ kind: 'site', siteId: 's1' }, byId)).toBe('/Sites/edm')
    expect(
      serveSitePath(
        { kind: 'link', pending: {} as never, target: { kind: 'existing', path: '/Sites/x' } },
        byId
      )
    ).toBe('/Sites/x')
  })
})
