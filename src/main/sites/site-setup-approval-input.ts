// Validates a setup-approval request arriving over the loopback bridge before it reaches a card.

import type {
  SiteSetupApprovalDetail,
  SiteSetupApprovalInput,
  SiteSetupSecretPrompt
} from '../../shared/site-setup-approval-types'

const MAX_TEXT = 2_000
const MAX_DETAILS = 24

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.slice(0, MAX_TEXT) : null
}

function readDetails(value: unknown): SiteSetupApprovalDetail[] {
  if (!Array.isArray(value)) {
    return []
  }
  const details: SiteSetupApprovalDetail[] = []
  for (const item of value.slice(0, MAX_DETAILS)) {
    const record = (item ?? {}) as Record<string, unknown>
    const label = text(record.label)
    const detail = typeof record.value === 'string' ? record.value.slice(0, MAX_TEXT) : null
    if (label && detail !== null) {
      details.push({ label, value: detail })
    }
  }
  return details
}

function readSecretPrompt(value: unknown): SiteSetupSecretPrompt | undefined {
  const record = (value ?? {}) as Record<string, unknown>
  const environment = text(record.environment)
  const kind = record.kind === 'ssh' || record.kind === 'db' ? record.kind : null
  return environment && kind ? { environment, kind } : undefined
}

/** Null when a required field is missing; the bridge answers 400 rather than show a blank card. */
export function readSetupApprovalInput(
  body: Record<string, unknown>
): SiteSetupApprovalInput | null {
  const action = text(body.action)
  const title = text(body.title)
  const summary = text(body.summary)
  if (!action || !title || !summary) {
    return null
  }
  const secret = readSecretPrompt(body.secret)
  // A password prompt is meaningless without the site it belongs to.
  if (body.secret !== undefined && (!secret || !text(body.siteId))) {
    return null
  }
  return {
    ...(secret ? { secret } : {}),
    action,
    title,
    summary,
    details: readDetails(body.details),
    siteId: text(body.siteId),
    siteName: text(body.siteName),
    agent: text(body.agent)
  }
}
