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
    // No filter at all when browsing, or Bitbucket would answer with an empty match set.
    expect(url).not.toContain('q=')
  })

  it('asks Bitbucket to do the matching when a query is given', () => {
    const url = bitbucketWorkspaceReposUrl('efront_au', '  sulo  ')
    // Trimmed, because a trailing space in `name~"sulo "` is part of the term Bitbucket matches.
    expect(new URL(url).searchParams.get('q')).toBe('name~"sulo"')
    // Paging and the field mask still apply: a broad query pages exactly like a browse.
    expect(url).toContain('pagelen=100')
  })

  it('matches on the repository name when a full name is pasted in', () => {
    // `name~"efront_au/sulo"` would match nothing: the field holds the name alone.
    expect(
      new URL(bitbucketWorkspaceReposUrl('efront_au', 'efront_au/sulo')).searchParams.get('q')
    ).toBe('name~"sulo"')
  })

  it('escapes quotes and backslashes so a crafted term cannot break out of the filter', () => {
    const q = (query: string): string =>
      new URL(bitbucketWorkspaceReposUrl('efront_au', query)).searchParams.get('q') ?? ''

    expect(q('a" OR name~"b')).toBe('name~"a\\" OR name~\\"b"')
    expect(q('back\\slash')).toBe('name~"back\\\\slash"')
    // The escape itself must not be escapable: a trailing backslash stays inert.
    expect(q('trailing\\')).toBe('name~"trailing\\\\"')
    // Whitespace-only is no query at all, not an empty match.
    expect(new URL(bitbucketWorkspaceReposUrl('efront_au', '   ')).searchParams.has('q')).toBe(
      false
    )
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

  it('sends the query to Bitbucket and still follows its paging', async () => {
    const script = scriptedFetch([
      { ok: true, status: 200, body: repoPage('sulo', 'https://api.bitbucket.org/page2') },
      { ok: true, status: 200, body: repoPage('sulo-legacy') }
    ])
    const result = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: script.fetchJson,
      query: 'sulo'
    })

    expect(new URL(script.urls[0]).searchParams.get('q')).toBe('name~"sulo"')
    expect(script.urls[1]).toBe('https://api.bitbucket.org/page2')
    expect(result.repos.map((repo) => repo.slug)).toEqual(['sulo', 'sulo-legacy'])
  })

  // The regression this guards: a search writing its hits into the browse cache, so the next open
  // shows only the last search's matches.
  it('keeps a query result out of the browse cache and leaves the browse list intact', async () => {
    const browse = scriptedFetch([{ ok: true, status: 200, body: repoPage('acme') }])
    await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: browse.fetchJson
    })

    const search = scriptedFetch([{ ok: true, status: 200, body: repoPage('sulo') }])
    const searched = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: search.fetchJson,
      query: 'sulo'
    })
    expect(searched.repos.map((repo) => repo.slug)).toEqual(['sulo'])

    const cached = scriptedFetch([])
    const afterSearch = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: cached.fetchJson,
      preferCache: true
    })
    expect(cached.urls).toEqual([])
    expect(afterSearch.repos.map((repo) => repo.slug)).toEqual(['acme'])
  })

  it('never answers a query from the browse cache, even when the search fails', async () => {
    const browse = scriptedFetch([{ ok: true, status: 200, body: repoPage('acme') }])
    await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: browse.fetchJson
    })

    const failing = scriptedFetch([{ ok: false, status: 401, body: null }])
    const searched = await listBitbucketWorkspaceRepos({
      workspace: 'efront_au',
      credentials: CREDENTIALS,
      fetchJson: failing.fetchJson,
      query: 'sulo',
      // Even asked for the cache: a cached browse list is not an answer to 'sulo'.
      preferCache: true
    })
    expect(failing.urls).toHaveLength(1)
    expect(searched.repos).toEqual([])
    expect(searched.fromCache).toBe(false)
    expect(searched.error).toContain('HTTP 401')
  })
})
