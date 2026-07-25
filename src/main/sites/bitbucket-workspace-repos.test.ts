import { beforeEach, describe, expect, it } from 'vitest'
import {
  bitbucketAuthHeaders,
  bitbucketWorkspaceReposUrl,
  clearBitbucketRepoCache,
  detectBitbucketWorkspace,
  listBitbucketWorkspaceRepos,
  pickBitbucketCloneUrl,
  type BitbucketApiResponse,
  type BitbucketFetchJson
} from './bitbucket-workspace-repos'

const CREDENTIALS = { username: 'jake@example.com', appPassword: 'ATBBsecret' }

function repoPage(slug: string, next?: string): Record<string, unknown> {
  return {
    size: 2,
    ...(next ? { next } : {}),
    values: [
      {
        slug,
        full_name: `efront_au/${slug}`,
        description: `  the ${slug} site  `,
        updated_on: '2026-07-01T00:00:00Z',
        links: {
          clone: [
            { name: 'https', href: `https://bitbucket.org/efront_au/${slug}.git` },
            { name: 'ssh', href: `git@bitbucket.org:efront_au/${slug}.git` }
          ]
        }
      }
    ]
  }
}

function scriptedFetch(pages: BitbucketApiResponse[]): {
  fetchJson: BitbucketFetchJson
  urls: string[]
  headers: Record<string, string>[]
} {
  const urls: string[] = []
  const headers: Record<string, string>[] = []
  let index = 0
  return {
    urls,
    headers,
    fetchJson: (url, requestHeaders) => {
      urls.push(url)
      headers.push(requestHeaders)
      const page = pages[index] ?? { ok: false, status: 500, body: null }
      index += 1
      return Promise.resolve(page)
    }
  }
}

beforeEach(() => {
  clearBitbucketRepoCache()
})

describe('request construction', () => {
  it('sends basic auth built from the stored credential', () => {
    expect(bitbucketAuthHeaders(CREDENTIALS)).toEqual({
      Authorization: `Basic ${Buffer.from('jake@example.com:ATBBsecret').toString('base64')}`,
      Accept: 'application/json'
    })
  })

  it('requests only the fields the picker needs, newest first', () => {
    const url = bitbucketWorkspaceReposUrl('efront au')
    expect(url).toContain('/repositories/efront%20au?')
    expect(url).toContain('pagelen=100')
    expect(url).toContain('sort=-updated_on')
    expect(decodeURIComponent(url)).toContain('values.links.clone')
  })

  it('detects the workspace from an ssh or https remote', () => {
    expect(detectBitbucketWorkspace('git@bitbucket.org:efront_au/acme.git')).toBe('efront_au')
    expect(detectBitbucketWorkspace('https://bitbucket.org/efront_au/acme.git')).toBe('efront_au')
    expect(detectBitbucketWorkspace('git@github.com:me/acme.git')).toBe('')
  })
})

describe('clone URL preference', () => {
  it('prefers ssh, then https, then anything present', () => {
    expect(
      pickBitbucketCloneUrl([
        { name: 'https', href: 'https://bitbucket.org/w/r.git' },
        { name: 'ssh', href: 'git@bitbucket.org:w/r.git' }
      ])
    ).toBe('git@bitbucket.org:w/r.git')
    expect(pickBitbucketCloneUrl([{ name: 'https', href: 'https://bitbucket.org/w/r.git' }])).toBe(
      'https://bitbucket.org/w/r.git'
    )
    expect(pickBitbucketCloneUrl([{ href: 'other://x' }])).toBe('other://x')
    expect(pickBitbucketCloneUrl([])).toBe('')
    expect(pickBitbucketCloneUrl(null)).toBe('')
  })
})

describe('listBitbucketWorkspaceRepos', () => {
  it('follows the next link across pages and keeps ssh clone URLs', async () => {
    const script = scriptedFetch([
      { ok: true, status: 200, body: repoPage('acme', 'https://api.bitbucket.org/page2') },
      { ok: true, status: 200, body: repoPage('beta') }
    ])
    const result = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: script.fetchJson
    })

    expect(script.urls).toHaveLength(2)
    expect(script.urls[1]).toBe('https://api.bitbucket.org/page2')
    expect(script.headers[1]?.Authorization).toBe(script.headers[0]?.Authorization)
    expect(result).toMatchObject({ configured: true, fromCache: false, error: '' })
    expect(result.repos.map((repo) => repo.slug)).toEqual(['acme', 'beta'])
    expect(result.repos[0]).toMatchObject({
      fullName: 'efront_au/acme',
      cloneUrl: 'git@bitbucket.org:efront_au/acme.git',
      description: 'the acme site',
      updatedOn: '2026-07-01T00:00:00Z'
    })
  })

  it('reports not-configured instead of throwing when no credential is stored', async () => {
    const script = scriptedFetch([])
    for (const credentials of [
      null,
      { username: '', appPassword: 'x' },
      { username: 'x', appPassword: '' }
    ]) {
      const result = await listBitbucketWorkspaceRepos({
        workspace: 'efront_au',
        credentials,
        fetchJson: script.fetchJson
      })
      expect(result).toEqual({
        configured: false,
        workspace: 'efront_au',
        repos: [],
        fromCache: false,
        error: 'No Bitbucket App Password is stored for Muster.'
      })
    }
    expect(script.urls).toEqual([])
  })

  it('reports a missing workspace without a request', async () => {
    const script = scriptedFetch([])
    const result = await listBitbucketWorkspaceRepos({
      workspace: '  ',
      credentials: CREDENTIALS,
      fetchJson: script.fetchJson
    })
    expect(result).toMatchObject({
      configured: true,
      error: 'No Bitbucket workspace is configured.'
    })
    expect(script.urls).toEqual([])
  })

  it('translates each auth failure into an actionable message', async () => {
    for (const [status, fragment] of [
      [401, 'HTTP 401'],
      [403, 'read:repository'],
      [404, "Workspace 'efront_au' was not found"],
      [500, 'HTTP 500']
    ] as const) {
      clearBitbucketRepoCache()
      const result = await listBitbucketWorkspaceRepos({
        workspace: 'efront_au',
        credentials: CREDENTIALS,
        fetchJson: scriptedFetch([{ ok: false, status, body: null }]).fetchJson
      })
      expect(result.repos).toEqual([])
      expect(result.error).toContain(fragment)
    }
  })

  it('keeps a partial page when a later page fails', async () => {
    const result = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: scriptedFetch([
        { ok: true, status: 200, body: repoPage('acme', 'https://api.bitbucket.org/page2') },
        { ok: false, status: 502, body: null }
      ]).fetchJson
    })
    expect(result.repos.map((repo) => repo.slug)).toEqual(['acme'])
    expect(result.error).toContain('HTTP 502')
  })

  it('serves the cache after a failure and skips the network when preferCache is set', async () => {
    const good = scriptedFetch([{ ok: true, status: 200, body: repoPage('acme') }])
    await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: good.fetchJson
    })

    const failing = scriptedFetch([{ ok: false, status: 401, body: null }])
    const afterFailure = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: failing.fetchJson
    })
    expect(afterFailure).toMatchObject({ fromCache: true })
    expect(afterFailure.repos.map((repo) => repo.slug)).toEqual(['acme'])

    const cached = scriptedFetch([])
    const fromCache = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: cached.fetchJson,
      preferCache: true
    })
    expect(cached.urls).toEqual([])
    expect(fromCache).toMatchObject({ fromCache: true, error: '' })
  })

  it('reports a transport error without throwing', async () => {
    const result = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: () => Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    })
    expect(result.error).toBe('Could not reach Bitbucket: getaddrinfo ENOTFOUND')
    expect(result.repos).toEqual([])
  })

  it('stops when the next link repeats and drops entries with no slug', async () => {
    const selfReferential = 'https://api.bitbucket.org/loop'
    const script = scriptedFetch([
      {
        ok: true,
        status: 200,
        body: { values: [{ slug: '' }, { slug: 'acme' }], next: selfReferential }
      },
      { ok: true, status: 200, body: { values: [], next: selfReferential } }
    ])
    const result = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: script.fetchJson
    })
    expect(script.urls).toHaveLength(2)
    expect(result.repos.map((repo) => repo.slug)).toEqual(['acme'])
  })
})
