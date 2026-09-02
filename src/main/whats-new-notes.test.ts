import { describe, expect, it, vi } from 'vitest'
import { createGitHubReleaseNotesLoader } from './whats-new-notes'

type Release = {
  tag_name: string
  body: string
  html_url: string
  draft?: boolean
  prerelease?: boolean
}

function release(version: string, body = `notes for ${version}`): Release {
  return {
    tag_name: `v${version}`,
    body,
    html_url: `https://github.com/jefrontv/muster/releases/tag/v${version}`
  }
}

/** Answers the releases list, and 404s the single-tag route unless told otherwise. */
function stubFetch(releases: Release[], listOk = true): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/releases?')) {
      return {
        ok: listOk,
        json: async () => releases
      } as Response
    }
    const tag = url.split('/tags/')[1]
    const hit = releases.find((entry) => entry.tag_name === tag)
    return { ok: hit !== undefined, json: async () => hit } as Response
  }) as unknown as typeof fetch
}

describe('release notes loader', () => {
  it('returns the current release with no missed versions on a single-step update', async () => {
    const load = createGitHubReleaseNotesLoader(stubFetch([release('1.9.0'), release('1.8.0')]))
    const payload = await load('1.9.0', '1.8.0')
    expect(payload).toMatchObject({ version: '1.9.0', notes: 'notes for 1.9.0' })
    expect(payload?.missed).toEqual([])
  })

  it('appends every release the user skipped, newest first', async () => {
    // Why this is the point of the feature: updating 1.6.0 -> 1.9.0 means 1.7 and 1.8 were never
    // seen, and showing only the newest notes buries everything that landed in between.
    const load = createGitHubReleaseNotesLoader(
      stubFetch([release('1.9.0'), release('1.8.0'), release('1.7.0'), release('1.6.0')])
    )
    const payload = await load('1.9.0', '1.6.0')
    expect(payload?.missed.map((entry) => entry.version)).toEqual(['1.8.0', '1.7.0'])
    expect(payload?.missedOverflow).toBe(0)
  })

  it('excludes the version they were already on and the one they are now on', async () => {
    const load = createGitHubReleaseNotesLoader(
      stubFetch([release('1.9.0'), release('1.8.0'), release('1.7.0')])
    )
    const payload = await load('1.9.0', '1.7.0')
    const shown = [payload?.version, ...(payload?.missed ?? []).map((entry) => entry.version)]
    expect(shown).toEqual(['1.9.0', '1.8.0'])
  })

  it('orders numerically, so 1.10.0 is newer than 1.9.0', async () => {
    // Why assert this: string ordering puts "1.10.0" before "1.9.0", which reads backwards.
    const load = createGitHubReleaseNotesLoader(
      stubFetch([release('1.11.0'), release('1.10.0'), release('1.9.0'), release('1.8.0')])
    )
    const payload = await load('1.11.0', '1.8.0')
    expect(payload?.missed.map((entry) => entry.version)).toEqual(['1.10.0', '1.9.0'])
  })

  it('caps the list and counts the rest rather than rendering an endless wall', async () => {
    const many = Array.from({ length: 15 }, (_, index) => release(`1.${20 - index}.0`))
    const load = createGitHubReleaseNotesLoader(stubFetch(many))
    const payload = await load('1.20.0', '1.6.0')
    expect(payload?.missed).toHaveLength(8)
    expect(payload?.missedOverflow).toBe(5)
  })

  it('skips drafts and prereleases, which GitHub flags for us', async () => {
    const load = createGitHubReleaseNotesLoader(
      stubFetch([
        release('1.9.0'),
        { ...release('1.8.5'), draft: true },
        { ...release('1.8.0-rc.1'), prerelease: true },
        release('1.8.0'),
        release('1.7.0')
      ])
    )
    const payload = await load('1.9.0', '1.7.0')
    expect(payload?.missed.map((entry) => entry.version)).toEqual(['1.8.0'])
  })

  it('shows only the current release when the previous version is unknown', async () => {
    const load = createGitHubReleaseNotesLoader(stubFetch([release('1.9.0'), release('1.8.0')]))
    const payload = await load('1.9.0', null)
    expect(payload?.missed).toEqual([])
  })

  it('falls back to the single-tag fetch when the list is unavailable', async () => {
    // Rate limiting hits the list route the same as any other; a modal with the current release's
    // notes is much better than no modal.
    const load = createGitHubReleaseNotesLoader(
      stubFetch([release('1.9.0'), release('1.8.0')], false)
    )
    const payload = await load('1.9.0', '1.7.0')
    expect(payload).toMatchObject({ version: '1.9.0', notes: 'notes for 1.9.0', missed: [] })
  })

  it('returns null when the running build has no published release', async () => {
    const load = createGitHubReleaseNotesLoader(stubFetch([release('1.8.0')]))
    expect(await load('1.99.0-local', '1.8.0')).toBeNull()
  })

  it('asks the network once per transition', async () => {
    const fetchImpl = stubFetch([release('1.9.0'), release('1.8.0')])
    const load = createGitHubReleaseNotesLoader(fetchImpl)
    await load('1.9.0', '1.8.0')
    await load('1.9.0', '1.8.0')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
