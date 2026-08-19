// Relays a report to the Muster site, which files it as an issue under a
// GitHub App bot.
//
// Why a second lane at all: the `gh` path in feedback-issue.ts files the issue
// as the user, which is the better outcome — a triager can reply to a real
// account. But it needs `gh` installed and signed in, so without this fallback
// anyone who has not set that up simply cannot report anything.
//
// The endpoint holds the credential; nothing secret ships in the app. It also
// re-derives the issue body from these fields rather than trusting a
// ready-made one, so the shape here is raw values, not markdown.

import { net } from 'electron'

/** Deployed alongside the download page. Overridable so a dev build can aim at a local PHP server. */
const DEFAULT_FEEDBACK_ENDPOINT = 'https://muster.tools.efront.dev/feedback.php'

const REQUEST_TIMEOUT_MS = 20_000

export type FeedbackEndpointPayload = {
  feedback: string
  submissionType: 'feedback' | 'crash'
  githubLogin: string | null
  githubEmail: string | null
  appVersion: string
  platform: string
  osRelease: string
  arch: string
  diagnosticBundle?: {
    bundleSubmissionId: string
    content: string
    bytes: number
    spanCount: number
  }
}

export type FeedbackEndpointResult =
  | { ok: true; url?: string }
  | { ok: false; status: number | null; error: string }

export function feedbackEndpointUrl(): string {
  const configured = process.env.MUSTER_FEEDBACK_ENDPOINT?.trim()
  return configured !== undefined && configured !== '' ? configured : DEFAULT_FEEDBACK_ENDPOINT
}

/**
 * The endpoint may require a shared key.
 *
 * It is a filter against drive-by scanners, not authentication: any value that
 * ships in a desktop build can be read out of it. The endpoint's rate limits
 * are what actually bound abuse, so an unset key is a supported configuration.
 */
function sharedSecretHeader(): Record<string, string> {
  const secret = process.env.MUSTER_FEEDBACK_KEY?.trim()
  return secret !== undefined && secret !== '' ? { 'X-Muster-Feedback-Key': secret } : {}
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A crash bundle has no size limit of its own, and the endpoint refuses a
 * request over 2 MiB — so an unlucky crash would report nothing at all.
 *
 * The cut takes the middle rather than the tail: the head carries the failure
 * and the tail the most recent spans. GitHub caps an issue body well below this
 * anyway, so nothing readable is lost that the server would not have cut.
 */
const MAX_RELAYED_BUNDLE_CHARS = 120_000

function capRelayedBundle(
  payload: FeedbackEndpointPayload['diagnosticBundle']
): FeedbackEndpointPayload['diagnosticBundle'] {
  if (payload === undefined || payload.content.length <= MAX_RELAYED_BUNDLE_CHARS) {
    return payload
  }
  const omitted = payload.content.length - MAX_RELAYED_BUNDLE_CHARS
  const notice = `\n… ${omitted} characters omitted from the middle before sending …\n`
  const keep = Math.floor((MAX_RELAYED_BUNDLE_CHARS - notice.length) / 2)

  return {
    ...payload,
    content: `${payload.content.slice(0, keep)}${notice}${payload.content.slice(-keep)}`
  }
}

/** The endpoint answers JSON on success and on failure; fall back to the raw text. */
function readResult(status: number, text: string): FeedbackEndpointResult {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  const payload = (parsed ?? {}) as { ok?: unknown; issueUrl?: unknown; error?: unknown }

  if (status >= 200 && status < 300 && payload.ok === true) {
    return { ok: true, url: typeof payload.issueUrl === 'string' ? payload.issueUrl : undefined }
  }

  const error =
    typeof payload.error === 'string' && payload.error !== ''
      ? payload.error
      : text.trim() !== ''
        ? text.trim().slice(0, 200)
        : `The feedback endpoint answered ${status}`

  return { ok: false, status, error }
}

/**
 * Why net.fetch rather than global fetch: global fetch runs on Node's bundled
 * undici, where an unread response body can take the whole process down
 * (orca#8695). See global-fetch-call-site-audit.test.ts.
 */
export async function postFeedbackToEndpoint(
  payload: FeedbackEndpointPayload
): Promise<FeedbackEndpointResult> {
  try {
    const response = await net.fetch(feedbackEndpointUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sharedSecretHeader() },
      body: JSON.stringify({
        ...payload,
        ...(payload.diagnosticBundle !== undefined
          ? { diagnosticBundle: capRelayedBundle(payload.diagnosticBundle) }
          : {})
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    return readResult(response.status, await response.text())
  } catch (error) {
    // No status: the request never completed, so there is no code to report.
    return { ok: false, status: null, error: messageFromError(error) }
  }
}
