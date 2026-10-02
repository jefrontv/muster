import { describe, expect, it } from 'vitest'
import {
  domainHost,
  findLocalDomainClash,
  type LocalDomainSources
} from './local-domain-availability'

type Entry = Awaited<ReturnType<LocalDomainSources['ddev']>>[number]

function sources(over: Partial<Record<keyof LocalDomainSources, Entry[] | 'hang'>> = {}) {
  const read = (key: keyof LocalDomainSources) => async () => {
    const value = over[key] ?? []
    return value === 'hang' ? new Promise<Entry[]>(() => {}) : value
  }
  return { ddev: read('ddev'), agentLocal: read('agentLocal'), localWp: read('localWp') }
}

describe('findLocalDomainClash', () => {
  it('names the DDEV project in another folder that holds the name', async () => {
    const found = await findLocalDomainClash(
      { sitePath: '/Sites/new', stack: 'ddev', domain: 'alchemy.ddev.site' },
      sources({
        ddev: [{ stack: 'ddev', host: 'alchemy.ddev.site', name: 'alchemy', path: '/Sites/old' }]
      })
    )
    expect(found).toEqual({ stack: 'ddev', name: 'alchemy', path: '/Sites/old' })
  })

  it('never counts the site’s own folder, including its docroot', async () => {
    const found = await findLocalDomainClash(
      { sitePath: '/Sites/edm', stack: 'agent-local', domain: 'edm.local' },
      sources({
        agentLocal: [
          { stack: 'agent-local', host: 'edm.local', name: 'edm', path: '/Sites/edm/app/public' }
        ]
      })
    )
    expect(found).toBeNull()
  })

  it('checks every stack for a .local domain, matching host-only and case-insensitively', async () => {
    const found = await findLocalDomainClash(
      { sitePath: '/Sites/new', stack: 'agent-local', domain: 'https://ACME.local:8443/' },
      sources({
        localWp: [{ stack: 'localwp', host: 'acme.local', name: 'Acme', path: '/Local Sites/acme' }]
      })
    )
    expect(found?.stack).toBe('localwp')
  })

  it('checks a DDEV name against DDEV only', async () => {
    const found = await findLocalDomainClash(
      { sitePath: '/Sites/new', stack: 'ddev', domain: 'acme.ddev.site' },
      sources({
        localWp: [{ stack: 'localwp', host: 'acme.ddev.site', name: 'x', path: '/elsewhere' }]
      })
    )
    expect(found).toBeNull()
  })

  it('skips a stack that does not answer instead of holding the field', async () => {
    const found = await findLocalDomainClash(
      { sitePath: '/Sites/new', stack: 'agent-local', domain: 'acme.local' },
      sources({ agentLocal: 'hang' })
    )
    expect(found).toBeNull()
  }, 5_000)
})

describe('domainHost', () => {
  it('strips scheme, port and path', () => {
    expect(domainHost(' https://Foo.ddev.site:8843/x ')).toBe('foo.ddev.site')
  })
})
