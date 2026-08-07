// Posts a site-run result to a Slack incoming webhook. Fire-and-forget by design: a Slack outage
// must never delay or fail a notification dispatch, so errors are swallowed after a bounded wait.

const WEBHOOK_TIMEOUT_MS = 5_000

export type SiteRunWebhookPayload = {
  siteName: string
  group: 'import' | 'deploy'
  environment: string
  status: string
}

const STATUS_EMOJI: Record<string, string> = {
  succeeded: ':white_check_mark:',
  failed: ':x:',
  cancelled: ':heavy_minus_sign:',
  blocked: ':no_entry:'
}

export function formatSiteRunSlackText(payload: SiteRunWebhookPayload): string {
  const emoji = STATUS_EMOJI[payload.status] ?? ':grey_question:'
  return `${emoji} ${payload.siteName}: ${payload.group} → ${payload.environment} ${payload.status}`
}

export function postSiteRunSlackWebhook(url: string, payload: SiteRunWebhookPayload): void {
  if (!url.startsWith('https://')) {
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: formatSiteRunSlackText(payload) }),
    signal: controller.signal
  })
    .catch(() => undefined)
    .finally(() => clearTimeout(timer))
}
