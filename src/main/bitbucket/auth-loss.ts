// One prompt per lost Bitbucket sign-in, not one per poll or retry.
//
// Electron-free on purpose: the muster-sites MCP server runs this code as plain Node and never
// wires it, so reports there are no-ops. Policy (env credentials win, OAuth must be available)
// is injected by the IPC layer.

import type { BitbucketAuthLoss, BitbucketAuthLossReason } from '../../shared/bitbucket-auth-types'

export type BitbucketAuthLossWiring = {
  /** False when the user could not act on a prompt (env credentials, no OAuth consumer). */
  shouldReport: () => boolean
  onChange: (loss: BitbucketAuthLoss | null) => void
}

let wiring: BitbucketAuthLossWiring | null = null
let pending: BitbucketAuthLoss | null = null
let dismissed = false

export function wireBitbucketAuthLoss(next: BitbucketAuthLossWiring | null): void {
  wiring = next
}

export function reportBitbucketAuthLoss(reason: BitbucketAuthLossReason, now = Date.now()): void {
  if (!wiring || pending || dismissed) {
    return
  }
  let allowed = false
  try {
    allowed = wiring.shouldReport()
  } catch {
    allowed = false
  }
  if (!allowed) {
    return
  }
  pending = { reason, detectedAt: now }
  wiring.onChange(pending)
}

export function getPendingBitbucketAuthLoss(): BitbucketAuthLoss | null {
  return pending
}

export function dismissBitbucketAuthLoss(): void {
  dismissed = true
  if (pending) {
    pending = null
    wiring?.onChange(null)
  }
}

/** Reconnect or disconnect: whatever fails next is a new failure. */
export function resetBitbucketAuthLoss(): void {
  dismissed = false
  if (pending) {
    pending = null
    wiring?.onChange(null)
  }
}

/** Test-only. */
export function _resetBitbucketAuthLossForTests(): void {
  wiring = null
  pending = null
  dismissed = false
}
