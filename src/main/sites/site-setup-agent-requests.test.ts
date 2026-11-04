import { afterEach, describe, expect, it } from 'vitest'
import type { SiteSetupAgentReport } from '../../shared/site-setup-agent-types'
import {
  clearSiteSetupAgentRequestsForTests,
  listOpenSiteSetupsForAgent,
  openSiteSetupForAgent,
  reportSiteSetupForAgent,
  setSiteSetupAgentSender,
  waitForSiteSetupForAgent
} from './site-setup-agent-requests'

const repoSource = {
  kind: 'repo' as const,
  repo: {
    provider: 'bitbucket' as const,
    fullName: 'efront_au/aidc',
    cloneUrl: 'git@bitbucket.org:efront_au/aidc.git',
    description: '',
    updatedAt: null,
    isPrivate: true
  }
}

function report(overrides: Partial<SiteSetupAgentReport>): SiteSetupAgentReport {
  return { state: 'reviewing', step: '', percent: null, detail: '', result: null, ...overrides }
}

function open(): string {
  const opened = openSiteSetupForAgent({
    source: repoSource,
    label: 'aidc',
    hints: {},
    agent: 'Bob'
  })
  if ('error' in opened) {
    throw new Error(opened.error)
  }
  return opened.setupId
}

afterEach(() => clearSiteSetupAgentRequestsForTests())

describe('agent site setups', () => {
  it('needs a window to open in', () => {
    expect(
      openSiteSetupForAgent({ source: repoSource, label: 'aidc', hints: {}, agent: null })
    ).toEqual({
      error: 'Open Muster and try again.'
    })
  })

  it('sends the request to the window and refuses a second while the first is open', () => {
    const sent: string[] = []
    setSiteSetupAgentSender((request) => sent.push(request.label))
    open()
    expect(sent).toEqual(['aidc'])
    expect(
      openSiteSetupForAgent({ source: repoSource, label: 'other', hints: {}, agent: null })
    ).toEqual({
      error: 'Muster is already setting up aidc. Wait for that to finish first.'
    })
  })

  it('wakes a waiter on a new state or step, not on a percent tick', async () => {
    setSiteSetupAgentSender(() => undefined)
    const id = open()
    reportSiteSetupForAgent(id, report({ state: 'running', step: 'clone', percent: 10 }))
    const first = await waitForSiteSetupForAgent(id, 0, 1_000)
    expect(first).toMatchObject({ known: true, version: 1, report: { step: 'clone' } })

    const pending = waitForSiteSetupForAgent(id, 1, 200)
    reportSiteSetupForAgent(id, report({ state: 'running', step: 'clone', percent: 60 }))
    // A tick alone times out, but the answer still carries the latest percent.
    expect(await pending).toMatchObject({ version: 1, report: { percent: 60 } })

    const next = waitForSiteSetupForAgent(id, 1, 5_000)
    reportSiteSetupForAgent(id, report({ state: 'running', step: 'register' }))
    expect(await next).toMatchObject({ version: 2, report: { step: 'register' } })
  })

  it('keeps a finished result and ignores later reports for it', async () => {
    setSiteSetupAgentSender(() => undefined)
    const id = open()
    const result = { siteId: 's1', path: '/Sites/aidc', steps: [] }
    reportSiteSetupForAgent(id, report({ state: 'done', result }))
    reportSiteSetupForAgent(id, report({ state: 'failed', detail: 'closed' }))
    expect(await waitForSiteSetupForAgent(id, 5, 1_000)).toMatchObject({
      report: { state: 'done', result }
    })
    expect(listOpenSiteSetupsForAgent()).toEqual([])
    // Finished, so a new setup can open.
    expect(open()).not.toBe(id)
  })

  it('says an unknown id is unknown', async () => {
    expect(await waitForSiteSetupForAgent('nope', 0, 10)).toEqual({ known: false })
  })
})
