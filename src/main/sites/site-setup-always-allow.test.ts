import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearSiteSetupApprovalsForTests,
  consumeSiteSetupApproval,
  openSiteSetupApproval,
  respondSiteSetupApproval,
  setSiteSetupAlwaysAllowStore,
  setSiteSetupApprovalSender,
  setSiteSetupSecretStore
} from './site-setup-approval-requests'
import { normalizeSiteSetupAlwaysAllow } from '../../shared/site-setup-always-allow'
import type { SiteSetupApprovalInput } from '../../shared/site-setup-approval-types'

let grants: string[] = []
let cards = 0

function input(
  action: string,
  extra: Partial<SiteSetupApprovalInput> = {}
): SiteSetupApprovalInput {
  return {
    action,
    title: action,
    summary: '',
    details: [],
    siteId: 'site-1',
    siteName: 'acme',
    agent: 'some-agent',
    ...extra
  }
}

function open(request: SiteSetupApprovalInput): { requestId: string; decision: unknown } {
  const opened = openSiteSetupApproval(request)
  if ('error' in opened) {
    throw new Error('expected a window')
  }
  return opened
}

beforeEach(() => {
  grants = []
  cards = 0
  setSiteSetupApprovalSender(() => {
    cards += 1
  })
  setSiteSetupAlwaysAllowStore({
    has: (action) => grants.includes(action),
    add: (action) => {
      grants = normalizeSiteSetupAlwaysAllow([...grants, action])
    }
  })
})

afterEach(() => {
  clearSiteSetupApprovalsForTests()
  setSiteSetupAlwaysAllowStore(null)
  setSiteSetupSecretStore(null)
})

describe('always allow', () => {
  it('saves the grant from an approved card, then answers that action without a card', () => {
    const first = open(input('create_project'))
    expect(first.decision).toBeNull()
    respondSiteSetupApproval(first.requestId, 'approved', undefined, true)
    expect(grants).toEqual(['create_project'])

    const second = open(input('create_project', { siteId: null, siteName: null }))
    expect(second.decision).toBe('approved')
    expect(cards).toBe(1)
    // The write route still needs a one-time approval, and gets exactly one.
    expect(consumeSiteSetupApproval(second.requestId, 'create_project')).toBe(true)
    expect(consumeSiteSetupApproval(second.requestId, 'create_project')).toBe(false)
    expect(consumeSiteSetupApproval(second.requestId, 'configure_site')).toBe(false)
  })

  it('saves nothing when the card is denied or the box was not ticked', () => {
    respondSiteSetupApproval(open(input('create_project')).requestId, 'denied', undefined, true)
    respondSiteSetupApproval(open(input('update_project')).requestId, 'approved')
    expect(grants).toEqual([])
  })

  it('never grants or skips a removal or a password, whatever the request claims', () => {
    respondSiteSetupApproval(open(input('remove_project')).requestId, 'approved', undefined, true)
    expect(grants).toEqual([])

    grants = ['configure_site']
    setSiteSetupSecretStore(() => {})
    const secret = open(
      input('configure_site', { secret: { environment: 'production', kind: 'ssh' } })
    )
    expect(secret.decision).toBeNull()
    respondSiteSetupApproval(secret.requestId, 'approved', 'hunter2', true)
    expect(grants).toEqual(['configure_site'])
  })

  it('asks again once the grant is removed', () => {
    grants = ['register_site']
    expect(open(input('register_site')).decision).toBe('approved')
    grants = []
    expect(open(input('register_site')).decision).toBeNull()
  })

  it('drops stale or ineligible names from saved settings', () => {
    expect(
      normalizeSiteSetupAlwaysAllow([
        'remove_project',
        'set_up_local_site',
        'x',
        'set_up_local_site',
        3
      ])
    ).toEqual(['set_up_local_site'])
    expect(normalizeSiteSetupAlwaysAllow('create_project')).toEqual([])
  })
})
