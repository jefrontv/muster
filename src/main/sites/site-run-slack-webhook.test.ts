import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatSiteRunSlackText, postSiteRunSlackWebhook } from './site-run-slack-webhook'

describe('formatSiteRunSlackText', () => {
  it('formats a success with the site, group, environment and status', () => {
    expect(
      formatSiteRunSlackText({
        siteName: 'roads-australia',
        group: 'deploy',
        environment: 'staging',
        status: 'succeeded'
      })
    ).toBe(':white_check_mark: roads-australia: deploy → staging succeeded')
  })

  it('falls back to a neutral emoji for unknown statuses', () => {
    expect(
      formatSiteRunSlackText({
        siteName: 's',
        group: 'import',
        environment: 'main',
        status: 'weird'
      })
    ).toContain(':grey_question:')
  })
})

describe('postSiteRunSlackWebhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts JSON to the webhook', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    postSiteRunSlackWebhook('https://hooks.slack.com/services/x', {
      siteName: 's',
      group: 'deploy',
      environment: 'main',
      status: 'failed'
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hooks.slack.com/services/x')
    expect(JSON.parse((init as { body: string }).body).text).toContain('failed')
  })

  it('refuses non-https URLs', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    postSiteRunSlackWebhook('http://attacker.example/hook', {
      siteName: 's',
      group: 'import',
      environment: 'main',
      status: 'succeeded'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows network failures', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    expect(() =>
      postSiteRunSlackWebhook('https://hooks.slack.com/services/x', {
        siteName: 's',
        group: 'deploy',
        environment: 'main',
        status: 'succeeded'
      })
    ).not.toThrow()
  })
})
