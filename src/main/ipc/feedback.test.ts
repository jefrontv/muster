import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type FeedbackIssueModule = typeof FeedbackIssue

const { createIssueMock, handlers } = vi.hoisted(() => ({
  createIssueMock: vi.fn(),
  handlers: new Map<string, (_event: unknown, args?: unknown) => unknown>()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3-test' },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, args?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel))
  }
}))

vi.mock('../github/feedback-issue', async (importOriginal) => {
  const actual = await importOriginal<FeedbackIssueModule>()
  return { ...actual, createFeedbackIssue: createIssueMock }
})

import { registerFeedbackHandlers, submitFeedback } from './feedback'
import type * as FeedbackIssue from '../github/feedback-issue'

/** The issue payload the submission handed to gh. */
function filedIssue(callIndex = 0): { kind: string; title: string; body: string } {
  return createIssueMock.mock.calls[callIndex]?.[0]
}

beforeEach(() => {
  createIssueMock.mockReset()
  createIssueMock.mockResolvedValue({ ok: true, url: 'https://github.com/jefrontv/muster/issues/7' })
  handlers.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('submitFeedback', () => {
  it('files the report as an issue and returns its url', async () => {
    await expect(
      submitFeedback({ feedback: 'Sidebar drag is janky', githubLogin: null, githubEmail: null })
    ).resolves.toEqual({ ok: true, issueUrl: 'https://github.com/jefrontv/muster/issues/7' })
    expect(filedIssue().kind).toBe('feedback')
    expect(filedIssue().title).toBe('Feedback: Sidebar drag is janky')
  })

  it('stamps the build and platform onto every report', async () => {
    await submitFeedback({ feedback: 'note', githubLogin: null, githubEmail: null })
    expect(filedIssue().body).toContain('App version: 1.2.3-test')
    expect(filedIssue().body).toContain(`Platform: ${process.platform}`)
  })

  it('includes the reporter when identity is offered', async () => {
    await submitFeedback({ feedback: 'note', githubLogin: 'jake', githubEmail: 'jake@example.com' })
    expect(filedIssue().body).toContain('Reported by: @jake (jake@example.com)')
  })

  it('strips identity when the reporter opted out', async () => {
    await submitFeedback({
      feedback: 'note',
      submitAnonymously: true,
      githubLogin: 'jake',
      githubEmail: 'jake@example.com'
    })
    expect(filedIssue().body).not.toContain('jake')
  })

  it('labels a crash submission as a crash', async () => {
    await submitFeedback({
      feedback: 'App died opening a worktree',
      submissionType: 'crash',
      githubLogin: null,
      githubEmail: null
    })
    expect(filedIssue().kind).toBe('crash')
    expect(filedIssue().title).toBe('Crash report: App died opening a worktree')
  })

  it('folds a crash diagnostic bundle into a collapsed block', async () => {
    await submitFeedback({
      feedback: 'crashed',
      submissionType: 'crash',
      githubLogin: null,
      githubEmail: null,
      diagnosticBundle: {
        bundleSubmissionId: 'bundle-1',
        content: '{"span":1}\n{"span":2}',
        bytes: 21,
        spanCount: 2
      }
    })
    const body = filedIssue().body
    expect(body).toContain('<details>')
    expect(body).toContain('2 spans, 21 bytes (id bundle-1)')
    expect(body).toContain('{"span":2}')
  })

  it('never attaches a diagnostic bundle to a plain feedback submission', async () => {
    await submitFeedback({
      feedback: 'note',
      githubLogin: null,
      githubEmail: null,
      diagnosticBundle: {
        bundleSubmissionId: 'bundle-1',
        content: '{"span":1}',
        bytes: 10,
        spanCount: 1
      }
    })
    expect(filedIssue().body).not.toContain('<details>')
  })

  it('reports a gh failure without an http status to invent', async () => {
    createIssueMock.mockResolvedValue({ ok: false, error: 'gh: not authenticated' })
    await expect(
      submitFeedback({ feedback: 'note', githubLogin: null, githubEmail: null })
    ).resolves.toEqual({ ok: false, status: null, error: 'gh: not authenticated' })
  })

  it('surfaces a thrown error instead of rejecting the caller', async () => {
    createIssueMock.mockRejectedValue(new Error('spawn gh ENOENT'))
    await expect(
      submitFeedback({ feedback: 'note', githubLogin: null, githubEmail: null })
    ).resolves.toEqual({ ok: false, status: null, error: 'spawn gh ENOENT' })
  })
})

describe('registerFeedbackHandlers', () => {
  it('forces renderer IPC submissions onto the feedback lane', async () => {
    registerFeedbackHandlers()
    // A compromised renderer must not be able to file a crash-lane report.
    await handlers.get('feedback:submit')?.(null, {
      feedback: 'note',
      submissionType: 'crash',
      githubLogin: null,
      githubEmail: null
    })
    expect(filedIssue().kind).toBe('feedback')
  })
})
