// Files in-app feedback and crash reports as issues on the Muster repo, using
// the user's own `gh` auth.
//
// Why the user's gh rather than a hosted endpoint: submissions used to POST to
// upstream Orca's backend, which meant every report — including GitHub logins,
// emails, and diagnostic bundles — went to a third party this fork does not
// control. Filing through gh keeps the data between the user and the repo, and
// ships no credentials inside the app.

import { acquire, ghExecFileAsync, extractExecError, release } from './gh-utils'

/** Where reports land. Matches the star/changelog target in the GitHub client. */
const MUSTER_REPO = 'jefrontv/muster'

/** GitHub rejects bodies over 65536 chars; leave room for the report around it. */
const MAX_ISSUE_BODY_CHARS = 60_000
const FEEDBACK_LABEL = 'feedback'
const CRASH_LABEL = 'crash'

export type FeedbackIssueKind = 'feedback' | 'crash'

export type FeedbackIssueArgs = {
  kind: FeedbackIssueKind
  body: string
  /** Shown in the issue title; trimmed to a single line. */
  title: string
  labels?: string[]
}

export type FeedbackIssueResult = { ok: true; url: string } | { ok: false; error: string }

/** One line, no newlines, short enough to read in a list. */
export function feedbackIssueTitle(kind: FeedbackIssueKind, text: string): string {
  const firstLine = text.trim().split('\n', 1)[0]?.trim() ?? ''
  const prefix = kind === 'crash' ? 'Crash report' : 'Feedback'
  if (firstLine === '') {
    return prefix
  }
  const trimmed = firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
  return `${prefix}: ${trimmed}`
}

/**
 * Keeps a body under GitHub's limit by cutting the middle out, not the tail:
 * a crash bundle's head carries the failure and its tail the most recent spans,
 * so dropping either end loses the part someone actually reads.
 */
export function truncateIssueBody(body: string, max = MAX_ISSUE_BODY_CHARS): string {
  if (body.length <= max) {
    return body
  }
  const notice = `\n\n_… ${body.length - max} characters omitted from the middle of this report …_\n\n`
  const keep = Math.floor((max - notice.length) / 2)
  return `${body.slice(0, keep)}${notice}${body.slice(body.length - keep)}`
}

export async function createFeedbackIssue(args: FeedbackIssueArgs): Promise<FeedbackIssueResult> {
  const labels = args.labels ?? [args.kind === 'crash' ? CRASH_LABEL : FEEDBACK_LABEL]
  await acquire()
  try {
    const ghArgs = [
      'api',
      '-X',
      'POST',
      `repos/${MUSTER_REPO}/issues`,
      '-f',
      `title=${args.title}`,
      '-f',
      `body=${truncateIssueBody(args.body)}`,
      '--jq',
      '.html_url'
    ]
    // Labels have to exist on the repo; a missing one fails the whole call, so
    // they ride as a second attempt rather than blocking the report itself.
    const withLabels = [...ghArgs]
    for (const label of labels) {
      withLabels.splice(-2, 0, '-f', `labels[]=${label}`)
    }
    try {
      const { stdout } = await ghExecFileAsync(withLabels)
      return { ok: true, url: stdout.trim() }
    } catch {
      const { stdout } = await ghExecFileAsync(ghArgs)
      return { ok: true, url: stdout.trim() }
    }
  } catch (error) {
    const { stderr, stdout } = extractExecError(error)
    const detail = stderr.trim() || stdout.trim() || 'gh could not create the issue'
    return { ok: false, error: detail }
  } finally {
    release()
  }
}
