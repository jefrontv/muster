// Pending agent requests to create projects or write site config, answered in the Muster window.
//
// Same shape as plan-annotation-requests.ts: open returns an id at once, the caller polls with
// awaitSiteSetupApproval, and requests queue so two agents cannot replace each other's card.

import { randomUUID } from 'node:crypto'
import type {
  SiteSetupApprovalDecision,
  SiteSetupApprovalInput,
  SiteSetupApprovalOutcome,
  SiteSetupApprovalRequest
} from '../../shared/site-setup-approval-types'
import { isAlwaysAllowableSetupAction } from '../../shared/site-setup-always-allow'

/** Unanswered cards expire so a forgotten one cannot pin the agent and everything queued behind it. */
export const SITE_SETUP_APPROVAL_TIMEOUT_MS = 900_000

/** How long an answer stays collectable; the caller polls, so it usually lands between polls. */
export const SITE_SETUP_APPROVAL_RETENTION_MS = 900_000

type Pending = {
  request: SiteSetupApprovalRequest
  /** Only running once this request reaches the front. */
  timer: ReturnType<typeof setTimeout> | null
}

type Waiter = {
  resolve: (outcome: Exclude<SiteSetupApprovalOutcome, { status: 'unknown' }>) => void
  timer: ReturnType<typeof setTimeout>
}

const queue = new Map<string, Pending>()
const settled = new Map<
  string,
  {
    decision: SiteSetupApprovalDecision
    action: string
    consumed: boolean
    timer: ReturnType<typeof setTimeout>
  }
>()
const waiters = new Map<string, Set<Waiter>>()
/** Sites the user approved for the rest of this app session. Never persisted. */
const approvedSites = new Set<string>()

let sendRequest: ((request: SiteSetupApprovalRequest) => void) | null = null
let sendResolved: ((requestId: string) => void) | null = null
let storeSecret:
  | ((siteId: string, environment: string, kind: 'ssh' | 'db', value: string) => void)
  | null = null

/** The user's standing "Always allow" grants, kept in settings. Set once by main. */
let alwaysAllow: { has: (action: string) => boolean; add: (action: string) => void } | null = null

export function setSiteSetupAlwaysAllowStore(store: typeof alwaysAllow): void {
  alwaysAllow = store
}

/** A password prompt never qualifies, whatever its action name says. */
function alwaysAllowed(input: SiteSetupApprovalInput): boolean {
  return (
    !input.secret &&
    isAlwaysAllowableSetupAction(input.action) &&
    alwaysAllow?.has(input.action) === true
  )
}

/** Where an approved password prompt's value goes (the keychain). Set once by main. */
export function setSiteSetupSecretStore(store: typeof storeSecret): void {
  storeSecret = store
}

export function setSiteSetupApprovalSender(
  sender: ((request: SiteSetupApprovalRequest) => void) | null
): void {
  sendRequest = sender
}

/** Lets every window drop a card that settled elsewhere (timeout, or another window). */
export function setSiteSetupApprovalResolvedSender(
  sender: ((requestId: string) => void) | null
): void {
  sendResolved = sender
}

function head(): Pending | null {
  for (const entry of queue.values()) {
    return entry
  }
  return null
}

function retain(requestId: string, decision: SiteSetupApprovalDecision, action: string): void {
  const expiry = setTimeout(() => settled.delete(requestId), SITE_SETUP_APPROVAL_RETENTION_MS)
  expiry.unref?.()
  settled.set(requestId, { decision, action, consumed: false, timer: expiry })
}

function settle(entry: Pending, decision: SiteSetupApprovalDecision): void {
  if (entry.timer) {
    clearTimeout(entry.timer)
  }
  const { requestId, siteId } = entry.request
  queue.delete(requestId)
  if (decision === 'approved-site' && siteId) {
    approvedSites.add(siteId)
  }
  // Retained before waking waiters, so a poll arriving in between still collects it.
  retain(requestId, decision, entry.request.action)
  const parked = waiters.get(requestId)
  waiters.delete(requestId)
  for (const waiter of parked ?? []) {
    clearTimeout(waiter.timer)
    waiter.resolve({ status: 'settled', decision })
  }
  try {
    sendResolved?.(requestId)
  } catch {
    // A destroyed window mid-broadcast must not stop the request settling.
  }
}

/** Shows the front request and starts its clock, so a queued request does not expire unseen. */
function startFront(): void {
  const entry = head()
  if (!entry || entry.timer) {
    return
  }
  entry.timer = setTimeout(() => {
    settle(entry, 'expired')
    startFront()
  }, SITE_SETUP_APPROVAL_TIMEOUT_MS)
  entry.timer.unref?.()
  try {
    sendRequest?.(entry.request)
  } catch {
    // A destroyed window mid-send falls through to expiry.
  }
}

/**
 * Stages a request and returns at once. A site the user already approved for this session is
 * answered immediately, without a card.
 */
export function openSiteSetupApproval(
  input: SiteSetupApprovalInput
): { requestId: string; decision: SiteSetupApprovalDecision | null } | { error: 'no-window' } {
  if (!sendRequest) {
    return { error: 'no-window' }
  }
  const requestId = randomUUID()
  // A password prompt always needs the person: there is nothing to approve without their input.
  if (input.siteId && !input.secret && approvedSites.has(input.siteId)) {
    retain(requestId, 'approved-site', input.action)
    return { requestId, decision: 'approved-site' }
  }
  if (alwaysAllowed(input)) {
    retain(requestId, 'approved', input.action)
    return { requestId, decision: 'approved' }
  }
  queue.set(requestId, { request: { ...input, requestId, openedAt: Date.now() }, timer: null })
  startFront()
  return { requestId, decision: null }
}

/** Waits up to `timeoutMs`. `pending` means poll again; `unknown` means stop. */
export function awaitSiteSetupApproval(
  requestId: string,
  timeoutMs: number
): Promise<SiteSetupApprovalOutcome> {
  const done = settled.get(requestId)
  if (done) {
    return Promise.resolve({ status: 'settled', decision: done.decision })
  }
  const entry = queue.get(requestId)
  if (!entry) {
    return Promise.resolve({ status: 'unknown' })
  }
  const openedAt = entry.request.openedAt
  const { promise, resolve } =
    Promise.withResolvers<Exclude<SiteSetupApprovalOutcome, { status: 'unknown' }>>()
  const waiter: Waiter = {
    resolve,
    timer: setTimeout(
      () => {
        waiters.get(requestId)?.delete(waiter)
        resolve({ status: 'pending', openedMs: Date.now() - openedAt })
      },
      Math.max(0, timeoutMs)
    )
  }
  waiter.timer.unref?.()
  const forId = waiters.get(requestId) ?? new Set<Waiter>()
  forId.add(waiter)
  waiters.set(requestId, forId)
  return promise
}

/** Throws when a password prompt is approved without a value or the keychain refuses it. */
export function respondSiteSetupApproval(
  requestId: string,
  decision: Exclude<SiteSetupApprovalDecision, 'expired'>,
  secretValue?: string,
  /** The card's "Always allow" box: saved only when this card is approved and eligible. */
  alwaysAllowAction = false
): boolean {
  const entry = queue.get(requestId)
  if (!entry) {
    // Already settled: a double click, or a response racing the expiry.
    return false
  }
  const { secret, siteId } = entry.request
  if (secret && decision !== 'denied') {
    if (!secretValue || !siteId || !storeSecret) {
      throw new Error(
        secretValue ? 'Muster cannot store passwords right now.' : 'Enter the password.'
      )
    }
    // Stored before settling, so a keychain failure leaves the card open to retry.
    storeSecret(siteId, secret.environment, secret.kind, secretValue)
  }
  // "For this site" needs a site, and never applies to a password; both fall back to plain approval.
  settle(entry, decision === 'approved-site' && (!siteId || secret) ? 'approved' : decision)
  if (
    alwaysAllowAction &&
    decision !== 'denied' &&
    !secret &&
    isAlwaysAllowableSetupAction(entry.request.action)
  ) {
    try {
      alwaysAllow?.add(entry.request.action)
    } catch {
      // A settings write failure costs the grant, not this approval.
    }
  }
  startFront()
  return true
}

/**
 * True once for an approved request of this action, then false. The GUI checks this before running
 * a staged write, so the bridge cannot be used to skip the card or replay an old approval.
 */
export function consumeSiteSetupApproval(requestId: string, action: string): boolean {
  const done = settled.get(requestId)
  if (
    !done ||
    done.consumed ||
    done.action !== action ||
    (done.decision !== 'approved' && done.decision !== 'approved-site')
  ) {
    return false
  }
  done.consumed = true
  return true
}

/** A request still waiting for an answer, or null once it has settled. */
export function getPendingSiteSetupApproval(requestId: string): SiteSetupApprovalRequest | null {
  return queue.get(requestId)?.request ?? null
}

/** Requests still waiting, front first. Lets a window opened later rebuild its card. */
export function listPendingSiteSetupApprovals(): SiteSetupApprovalRequest[] {
  return [...queue.values()].map((entry) => entry.request)
}

/** Test-only: expire everything outstanding and forget approved sites. */
export function clearSiteSetupApprovalsForTests(): void {
  for (const entry of queue.values()) {
    settle(entry, 'expired')
  }
  for (const done of settled.values()) {
    clearTimeout(done.timer)
  }
  settled.clear()
  approvedSites.clear()
}
