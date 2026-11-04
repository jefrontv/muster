import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  awaitSiteSetupApproval,
  clearSiteSetupApprovalsForTests,
  consumeSiteSetupApproval,
  listPendingSiteSetupApprovals,
  openSiteSetupApproval,
  respondSiteSetupApproval,
  setSiteSetupApprovalResolvedSender,
  setSiteSetupApprovalSender,
  setSiteSetupSecretStore,
  SITE_SETUP_APPROVAL_TIMEOUT_MS
} from './site-setup-approval-requests'
import type {
  SiteSetupApprovalInput,
  SiteSetupApprovalRequest
} from '../../shared/site-setup-approval-types'

const sent: SiteSetupApprovalRequest[] = []
const resolved: string[] = []

function input(siteId: string | null = 'site-1'): SiteSetupApprovalInput {
  return {
    action: 'configure_site',
    title: 'Configure acme',
    summary: 'Set the SSH host',
    details: [{ label: 'SSH host', value: 'acme.example.com' }],
    siteId,
    siteName: siteId ? 'acme' : null,
    agent: 'muster-bots'
  }
}

function open(siteId?: string | null): { requestId: string; decision: unknown } {
  const opened = openSiteSetupApproval(input(siteId))
  if ('error' in opened) {
    throw new Error('expected a window')
  }
  return opened
}

beforeEach(() => {
  sent.length = 0
  resolved.length = 0
  setSiteSetupApprovalSender((request) => sent.push(request))
  setSiteSetupApprovalResolvedSender((requestId) => resolved.push(requestId))
})

afterEach(() => {
  clearSiteSetupApprovalsForTests()
  vi.useRealTimers()
})

describe('site setup approvals', () => {
  it('refuses when no window is listening', () => {
    setSiteSetupApprovalSender(null)
    expect(openSiteSetupApproval(input())).toEqual({ error: 'no-window' })
  })

  it('shows only the front request and the next one after it settles', async () => {
    const first = open()
    const second = open('site-2')
    expect(sent.map((request) => request.requestId)).toEqual([first.requestId])
    expect(listPendingSiteSetupApprovals()).toHaveLength(2)

    expect(respondSiteSetupApproval(first.requestId, 'denied')).toBe(true)
    expect(await awaitSiteSetupApproval(first.requestId, 0)).toEqual({
      status: 'settled',
      decision: 'denied'
    })
    expect(resolved).toEqual([first.requestId])
    expect(sent.map((request) => request.requestId)).toEqual([first.requestId, second.requestId])
  })

  it('wakes a parked poll when the user answers', async () => {
    const opened = open()
    const waiting = awaitSiteSetupApproval(opened.requestId, 60_000)
    respondSiteSetupApproval(opened.requestId, 'approved')
    expect(await waiting).toEqual({ status: 'settled', decision: 'approved' })
  })

  it('reports pending when the wait runs out', async () => {
    const opened = open()
    const outcome = await awaitSiteSetupApproval(opened.requestId, 0)
    expect(outcome.status).toBe('pending')
  })

  it('answers later requests for a site approved for the session without a card', () => {
    const first = open()
    respondSiteSetupApproval(first.requestId, 'approved-site')
    sent.length = 0
    const again = open()
    expect(again.decision).toBe('approved-site')
    expect(sent).toEqual([])
    expect(open('site-2').decision).toBeNull()
  })

  it('treats "for this site" without a site as a plain approval', async () => {
    const opened = open(null)
    respondSiteSetupApproval(opened.requestId, 'approved-site')
    expect(await awaitSiteSetupApproval(opened.requestId, 0)).toEqual({
      status: 'settled',
      decision: 'approved'
    })
  })

  it('expires an unanswered request and says so', async () => {
    vi.useFakeTimers()
    const opened = open()
    vi.advanceTimersByTime(SITE_SETUP_APPROVAL_TIMEOUT_MS)
    expect(await awaitSiteSetupApproval(opened.requestId, 0)).toEqual({
      status: 'settled',
      decision: 'expired'
    })
    expect(respondSiteSetupApproval(opened.requestId, 'approved')).toBe(false)
  })

  it('lets an approval be spent once, and only for its own action', () => {
    const opened = open()
    expect(consumeSiteSetupApproval(opened.requestId, 'configure_site')).toBe(false)
    respondSiteSetupApproval(opened.requestId, 'approved')
    expect(consumeSiteSetupApproval(opened.requestId, 'remove_project')).toBe(false)
    expect(consumeSiteSetupApproval(opened.requestId, 'configure_site')).toBe(true)
    expect(consumeSiteSetupApproval(opened.requestId, 'configure_site')).toBe(false)
    const denied = open()
    respondSiteSetupApproval(denied.requestId, 'denied')
    expect(consumeSiteSetupApproval(denied.requestId, 'configure_site')).toBe(false)
  })

  it('reports an id it never issued as unknown', async () => {
    expect(await awaitSiteSetupApproval('nope', 0)).toEqual({ status: 'unknown' })
  })
})

describe('password prompts', () => {
  const stored: string[] = []
  beforeEach(() => {
    stored.length = 0
    setSiteSetupSecretStore((siteId, environment, kind, value) =>
      stored.push(`${siteId}/${environment}/${kind}=${value}`)
    )
  })

  function openPrompt(): string {
    const opened = openSiteSetupApproval({
      ...input(),
      secret: { environment: 'main', kind: 'ssh' }
    })
    if ('error' in opened) {
      throw new Error('expected a window')
    }
    return opened.requestId
  }

  it('is never answered by a site approval, and stores the value on approve', async () => {
    respondSiteSetupApproval(open().requestId, 'approved-site')
    const requestId = openPrompt()
    expect(respondSiteSetupApproval(requestId, 'approved-site', 's3cret')).toBe(true)
    expect(stored).toEqual(['site-1/main/ssh=s3cret'])
    expect(await awaitSiteSetupApproval(requestId, 0)).toEqual({
      status: 'settled',
      decision: 'approved'
    })
  })

  it('stays open when approved without a value or when the keychain fails', () => {
    const requestId = openPrompt()
    expect(() => respondSiteSetupApproval(requestId, 'approved')).toThrow('Enter the password')
    setSiteSetupSecretStore(() => {
      throw new Error('keychain locked')
    })
    expect(() => respondSiteSetupApproval(requestId, 'approved', 'x')).toThrow('keychain locked')
    expect(listPendingSiteSetupApprovals().map((request) => request.requestId)).toContain(requestId)
    expect(respondSiteSetupApproval(requestId, 'denied')).toBe(true)
  })
})
