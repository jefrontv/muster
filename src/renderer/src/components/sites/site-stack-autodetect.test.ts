import { describe, expect, it } from 'vitest'
import { siteStackAutodetectPatch } from './site-stack-autodetect'

describe('siteStackAutodetectPatch', () => {
  it('adopts the detected stack and domain on an unconfigured site', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'plain', localDomain: '' },
        { stack: 'agent-local', domain: 'watchswiss.wp.local' }
      )
    ).toEqual({ localStack: 'agent-local', localDomain: 'watchswiss.wp.local' })
  })

  it('adopts the stack alone when detection has no domain', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'plain', localDomain: '' },
        { stack: 'localwp', domain: '' }
      )
    ).toEqual({ localStack: 'localwp' })
  })

  it('does not adopt over a deliberate None on a configured site', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'plain', localDomain: 'acme.local' },
        { stack: 'agent-local', domain: 'acme.wp.local' }
      )
    ).toBeNull()
  })

  it('syncs a drifted domain when the record and detection agree on the stack', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'localwp', localDomain: 'old.local' },
        { stack: 'localwp', domain: 'acme.local' }
      )
    ).toEqual({ localDomain: 'acme.local' })
  })

  it('fills an unset domain on a confirmed stack', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'agent-local', localDomain: '' },
        { stack: 'agent-local', domain: 'acme.wp.local' }
      )
    ).toEqual({ localDomain: 'acme.wp.local' })
  })

  it('is a no-op when the domain already matches', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'localwp', localDomain: 'acme.local' },
        { stack: 'localwp', domain: 'acme.local' }
      )
    ).toBeNull()
  })

  it('holds on a stack conflict — switching transports stays a manual decision', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'localwp', localDomain: 'acme.local' },
        { stack: 'agent-local', domain: 'acme.wp.local' }
      )
    ).toBeNull()
  })

  it('never adopts a plain detection', () => {
    expect(
      siteStackAutodetectPatch(
        { localStack: 'plain', localDomain: '' },
        { stack: 'plain', domain: '' }
      )
    ).toBeNull()
  })
})
