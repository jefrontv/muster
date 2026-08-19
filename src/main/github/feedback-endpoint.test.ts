import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock('electron', () => ({ net: { fetch: fetchMock } }))

import { feedbackEndpointUrl, postFeedbackToEndpoint } from './feedback-endpoint'

const REPORT = {
  feedback: 'Sidebar drag is janky',
  submissionType: 'feedback' as const,
  githubLogin: null,
  githubEmail: null,
  appVersion: '1.2.3-test',
  platform: 'darwin',
  osRelease: '25.5.0',
  arch: 'arm64'
}

function answer(status: number, body: string): Response {
  return { status, text: async () => body } as unknown as Response
}

/** The request init the client handed to net.fetch. */
function sentInit(): { headers: Record<string, string>; body: string; method: string } {
  return fetchMock.mock.calls[0]?.[1]
}

beforeEach(() => {
  fetchMock.mockReset()
  delete process.env.MUSTER_FEEDBACK_ENDPOINT
  delete process.env.MUSTER_FEEDBACK_KEY
})

afterEach(() => {
  delete process.env.MUSTER_FEEDBACK_ENDPOINT
  delete process.env.MUSTER_FEEDBACK_KEY
  vi.restoreAllMocks()
})

describe('feedbackEndpointUrl', () => {
  it('points at the deployed site by default', () => {
    expect(feedbackEndpointUrl()).toBe('https://muster.tools.efront.dev/feedback.php')
  })

  it('lets a dev build aim at a local server', () => {
    process.env.MUSTER_FEEDBACK_ENDPOINT = 'http://127.0.0.1:8899/feedback.php'
    expect(feedbackEndpointUrl()).toBe('http://127.0.0.1:8899/feedback.php')
  })

  it('ignores an empty override rather than posting nowhere', () => {
    process.env.MUSTER_FEEDBACK_ENDPOINT = '   '
    expect(feedbackEndpointUrl()).toBe('https://muster.tools.efront.dev/feedback.php')
  })
})

describe('postFeedbackToEndpoint', () => {
  it('returns the issue url the endpoint filed', async () => {
    fetchMock.mockResolvedValue(
      answer(200, JSON.stringify({ ok: true, issueUrl: 'https://github.com/o/r/issues/3' }))
    )
    await expect(postFeedbackToEndpoint(REPORT)).resolves.toEqual({
      ok: true,
      url: 'https://github.com/o/r/issues/3'
    })
    expect(sentInit().method).toBe('POST')
    expect(JSON.parse(sentInit().body)).toMatchObject({ feedback: 'Sidebar drag is janky' })
  })

  it('omits the shared key header when none is configured', async () => {
    fetchMock.mockResolvedValue(answer(200, JSON.stringify({ ok: true })))
    await postFeedbackToEndpoint(REPORT)
    expect(sentInit().headers).not.toHaveProperty('X-Muster-Feedback-Key')
  })

  it('sends the shared key when one is configured', async () => {
    process.env.MUSTER_FEEDBACK_KEY = 'secret-value'
    fetchMock.mockResolvedValue(answer(200, JSON.stringify({ ok: true })))
    await postFeedbackToEndpoint(REPORT)
    expect(sentInit().headers['X-Muster-Feedback-Key']).toBe('secret-value')
  })

  it('carries the endpoint error and status through', async () => {
    fetchMock.mockResolvedValue(
      answer(429, JSON.stringify({ ok: false, status: 429, error: 'Too many reports from here.' }))
    )
    await expect(postFeedbackToEndpoint(REPORT)).resolves.toEqual({
      ok: false,
      status: 429,
      error: 'Too many reports from here.'
    })
  })

  it('treats a 200 that does not say ok as a failure', async () => {
    // A proxy or error page can answer 200 with something that is not the contract.
    fetchMock.mockResolvedValue(answer(200, '<html>maintenance</html>'))
    const result = await postFeedbackToEndpoint(REPORT)
    expect(result.ok).toBe(false)
  })

  it('falls back to the raw text when the failure is not json', async () => {
    fetchMock.mockResolvedValue(answer(502, 'Bad Gateway'))
    await expect(postFeedbackToEndpoint(REPORT)).resolves.toEqual({
      ok: false,
      status: 502,
      error: 'Bad Gateway'
    })
  })

  it('reports a network failure without inventing a status', async () => {
    fetchMock.mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))
    await expect(postFeedbackToEndpoint(REPORT)).resolves.toEqual({
      ok: false,
      status: null,
      error: 'net::ERR_NAME_NOT_RESOLVED'
    })
  })

  it('sends a crash bundle when one is attached', async () => {
    fetchMock.mockResolvedValue(answer(200, JSON.stringify({ ok: true })))
    await postFeedbackToEndpoint({
      ...REPORT,
      submissionType: 'crash',
      diagnosticBundle: {
        bundleSubmissionId: 'bundle-1',
        content: '{"span":1}',
        bytes: 10,
        spanCount: 1
      }
    })
    expect(JSON.parse(sentInit().body).diagnosticBundle.bundleSubmissionId).toBe('bundle-1')
  })

  it('trims an oversized bundle so the endpoint does not refuse the whole report', async () => {
    fetchMock.mockResolvedValue(answer(200, JSON.stringify({ ok: true })))
    const content = `HEAD${'x'.repeat(400_000)}TAIL`
    await postFeedbackToEndpoint({
      ...REPORT,
      submissionType: 'crash',
      diagnosticBundle: {
        bundleSubmissionId: 'bundle-2',
        content,
        bytes: content.length,
        spanCount: 9
      }
    })
    const sent = JSON.parse(sentInit().body).diagnosticBundle.content
    expect(sent.length).toBeLessThanOrEqual(120_000)
    // The failure is at the head and the newest spans at the tail; both survive.
    expect(sent.startsWith('HEAD')).toBe(true)
    expect(sent.endsWith('TAIL')).toBe(true)
    expect(sent).toContain('characters omitted')
  })
})
