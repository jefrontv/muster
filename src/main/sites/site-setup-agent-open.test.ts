import { afterEach, describe, expect, it } from 'vitest'
import { openAgentSiteSetup, repoFromCloneUrl } from './site-setup-agent-open'
import {
  clearSiteSetupAgentRequestsForTests,
  setSiteSetupAgentSender
} from './site-setup-agent-requests'
import type { SiteSetupAgentRequest } from '../../shared/site-setup-agent-types'

const store = {
  getSite: (id: string) => (id === 's1' ? { id: 's1', displayName: 'Acme' } : null),
  findSiteByPath: () => null
}

afterEach(() => clearSiteSetupAgentRequestsForTests())

describe('repoFromCloneUrl', () => {
  it.each([
    ['git@bitbucket.org:efront_au/aidc.git', 'bitbucket', 'efront_au/aidc'],
    ['git@ssh.bitbucket.org:efront_au/aidc.git', 'bitbucket', 'efront_au/aidc'],
    ['https://github.com/efront/site.git', 'github', 'efront/site'],
    ['ssh://git@github.com/efront/site', 'github', 'efront/site'],
    ['/tmp/mirrors/throwaway.git', 'bitbucket', 'throwaway'],
    ['file:///tmp/mirrors/throwaway.git/', 'bitbucket', 'throwaway']
  ])('reads %s', (url, provider, fullName) => {
    expect(repoFromCloneUrl(url)).toMatchObject({ provider, fullName, cloneUrl: url })
  })

  it('refuses something that is not a git URL', () => {
    expect(() => repoFromCloneUrl('aidc')).toThrow(TypeError)
  })
})

describe('openAgentSiteSetup', () => {
  it('opens a clone with the agent and its hints', () => {
    const sent: SiteSetupAgentRequest[] = []
    setSiteSetupAgentSender((request) => sent.push(request))
    const opened = openAgentSiteSetup(store, {
      cloneUrl: 'git@bitbucket.org:efront_au/aidc.git',
      stack: 'agent-local',
      serve: true,
      agent: 'Bob'
    })
    expect(opened).toMatchObject({ label: 'aidc', status: 'opened' })
    expect(sent[0]).toMatchObject({
      label: 'aidc',
      agent: 'Bob',
      hints: { stack: 'agent-local', serve: true },
      source: { kind: 'repo', repo: { fullName: 'efront_au/aidc' } }
    })
  })

  it('opens Finish setup for an existing site', () => {
    const sent: SiteSetupAgentRequest[] = []
    setSiteSetupAgentSender((request) => sent.push(request))
    openAgentSiteSetup(store, { siteId: 's1' })
    expect(sent[0]).toMatchObject({ label: 'Acme', source: { kind: 'site', siteId: 's1' } })
  })

  it('refuses both or neither source, an unknown site and an unknown stack', () => {
    setSiteSetupAgentSender(() => undefined)
    expect(() => openAgentSiteSetup(store, {})).toThrow(/exactly one/)
    expect(() => openAgentSiteSetup(store, { siteId: 'nope' })).toThrow(/No site/)
    expect(() =>
      openAgentSiteSetup(store, { cloneUrl: 'git@github.com:a/b.git', stack: 'mamp' })
    ).toThrow(/stack/)
  })
})
