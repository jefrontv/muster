import os from 'node:os'
import { app, ipcMain } from 'electron'
import { postFeedbackToEndpoint } from '../github/feedback-endpoint'
import {
  createFeedbackIssue,
  feedbackIssueTitle,
  type FeedbackIssueKind
} from '../github/feedback-issue'

// Feedback and crash reports are filed as issues on the Muster repo, preferring
// the user's own `gh` auth so the issue is authored by a real account. When gh
// is missing, signed out or refused, the report is relayed to the Muster site
// instead, which files it under a bot — otherwise anyone without gh set up
// could not report at all.
//
// They used to POST to upstream Orca's endpoint, which sent this fork's reports
// — GitHub logins, emails, diagnostic bundles — to a third party. Both lanes
// now stay within infrastructure this fork controls. Submission runs in the
// main process either way: it shells out to gh, which the renderer cannot do.

export type FeedbackSubmissionType = 'feedback' | 'crash'

export type FeedbackSubmitArgs = {
  feedback: string
  submitAnonymously?: boolean
  githubLogin: string | null
  githubEmail: string | null
}

export type FeedbackDiagnosticBundleAttachment = {
  bundleSubmissionId: string
  content: string
  bytes: number
  spanCount: number
}

type FeedbackSubmitBody = {
  feedback: string
  submissionType: FeedbackSubmissionType
  githubLogin: string | null
  githubEmail: string | null
  appVersion: string
  platform: NodeJS.Platform
  osRelease: string
  arch: string
  diagnosticBundle?: FeedbackDiagnosticBundleAttachment
}

export type FeedbackRequestFailure = {
  status: number | null
  error: string
}

export type FeedbackSubmitResult =
  | { ok: true; issueUrl?: string; diagnosticBundleFailure?: FeedbackRequestFailure }
  | ({ ok: false } & FeedbackRequestFailure & {
        diagnosticBundleFailure?: FeedbackRequestFailure
      })

type InternalFeedbackSubmitArgs = FeedbackSubmitArgs & {
  submissionType?: FeedbackSubmissionType
  diagnosticBundle?: FeedbackDiagnosticBundleAttachment
  feedbackWithoutDiagnosticBundle?: string
}

// Why: the Slack notification and any follow-up investigation need to know
// which Orca build and which OS the feedback came from. The main process is
// the only place with trusted access to these values (app.getVersion and the
// node os module), so we enrich the payload here rather than trusting the
// renderer.
function buildSubmitBody(args: InternalFeedbackSubmitArgs): FeedbackSubmitBody {
  const identity = args.submitAnonymously
    ? { githubLogin: null, githubEmail: null }
    : { githubLogin: args.githubLogin, githubEmail: args.githubEmail }

  // Why: anonymity is an IPC-only privacy decision. Allow-list fields here so
  // stale renderer state or future identity-shaped fields cannot leak upstream.
  return {
    feedback: args.feedback,
    submissionType: args.submissionType ?? 'feedback',
    ...identity,
    appVersion: app.getVersion(),
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    ...(args.submissionType === 'crash' && args.diagnosticBundle
      ? { diagnosticBundle: args.diagnosticBundle }
      : {})
  }
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The metadata block every report carries, so a triager sees the build first. */
function buildEnvironmentSection(body: FeedbackSubmitBody): string {
  const rows = [
    `- App version: ${body.appVersion}`,
    `- Platform: ${body.platform} ${body.osRelease} (${body.arch})`
  ]
  if (body.githubLogin) {
    rows.push(`- Reported by: @${body.githubLogin}${body.githubEmail ? ` (${body.githubEmail})` : ''}`)
  }
  return rows.join('\n')
}

/**
 * Why the bundle is inlined rather than attached: `gh api` posts JSON, and an
 * issue has no attachment field. A collapsed block keeps a multi-thousand-line
 * NDJSON dump out of the way while leaving it searchable in the issue.
 */
function buildDiagnosticSection(bundle: FeedbackDiagnosticBundleAttachment): string {
  return [
    '',
    '<details>',
    `<summary>Diagnostic bundle — ${bundle.spanCount} spans, ${bundle.bytes} bytes (id ${bundle.bundleSubmissionId})</summary>`,
    '',
    '```jsonl',
    bundle.content,
    '```',
    '',
    '</details>'
  ].join('\n')
}

function buildIssueBody(body: FeedbackSubmitBody): string {
  const sections = [body.feedback.trim(), '', '---', buildEnvironmentSection(body)]
  if (body.diagnosticBundle) {
    sections.push(buildDiagnosticSection(body.diagnosticBundle))
  }
  return sections.join('\n')
}

export async function submitFeedback(
  args: InternalFeedbackSubmitArgs
): Promise<FeedbackSubmitResult> {
  const body = buildSubmitBody(args)
  const kind: FeedbackIssueKind = body.submissionType === 'crash' ? 'crash' : 'feedback'

  let ghError: string
  try {
    const result = await createFeedbackIssue({
      kind,
      title: feedbackIssueTitle(kind, body.feedback),
      body: buildIssueBody(body)
    })
    if (result.ok) {
      return { ok: true, issueUrl: result.url }
    }
    ghError = result.error
  } catch (error) {
    ghError = messageFromError(error)
  }

  // gh is absent, unauthenticated, or refused by the repo. The site endpoint
  // carries its own credential, so the report still lands — as a bot-authored
  // issue with the reporter's claimed identity marked unverified.
  const relayed = await postFeedbackToEndpoint(body)
  if (relayed.ok) {
    return { ok: true, issueUrl: relayed.url }
  }

  // Surface the endpoint's failure rather than gh's: gh not working is the
  // expected case for most users, so its error is noise next to the lane that
  // was supposed to cover them.
  console.error(`Feedback: gh could not file the issue (${ghError})`)
  return { ok: false, status: relayed.status, error: relayed.error }
}

export function registerFeedbackHandlers(): void {
  ipcMain.removeHandler('feedback:submit')
  ipcMain.handle('feedback:submit', (_event, args: FeedbackSubmitArgs) =>
    // Why: crash submissions are main-only. A compromised renderer can invoke
    // this channel directly, so force the public feedback lane at the boundary.
    submitFeedback({ ...args, submissionType: 'feedback' })
  )
}
