import { describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  isOutdated,
  probeLatestVersion,
  type VersionProbeEnv
} from './version-probe'

function env(overrides: Partial<VersionProbeEnv> = {}): VersionProbeEnv {
  return {
    fetch: vi.fn().mockRejectedValue(new Error('no network in tests')),
    gitLsRemoteTags: vi.fn().mockResolvedValue([]),
    readAgentLocalLatest: vi.fn().mockResolvedValue(null),
    ...overrides
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
  })

  it('ignores a leading v', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
  })

  it('treats a missing segment as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
  })
})

describe('isOutdated', () => {
  it('needs both sides before it will claim anything', () => {
    expect(isOutdated(null, '2.0.0')).toBe(false)
    expect(isOutdated('1.0.0', null)).toBe(false)
  })

  it('reports an older install as outdated', () => {
    expect(isOutdated('1.0.0', '1.0.1')).toBe(true)
  })

  it('does not call a newer install outdated', () => {
    expect(isOutdated('2.0.0', '1.0.0')).toBe(false)
  })

  it('does not call a source build outdated', () => {
    expect(isOutdated('dev', '0.34.2')).toBe(false)
  })
})

describe('probeLatestVersion', () => {
  it('reads a PyPI version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ info: { version: '1.4.2' } }))
    expect(
      await probeLatestVersion({ source: 'pypi', package: 'acme' }, env({ fetch: fetchMock }))
    ).toBe('1.4.2')
  })

  it('reads an npm version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ version: '3.1.0' }))
    expect(
      await probeLatestVersion({ source: 'npm', package: 'acme' }, env({ fetch: fetchMock }))
    ).toBe('3.1.0')
  })

  it('strips the v from a GitHub release tag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tag_name: 'v2.5.0' }))
    expect(
      await probeLatestVersion({ source: 'github-release', repo: 'a/b' }, env({ fetch: fetchMock }))
    ).toBe('2.5.0')
  })

  it('picks the highest stable git tag and skips pre-releases', async () => {
    const tags = vi.fn().mockResolvedValue(['v0.9.0', 'v0.10.0', 'v0.11.0-rc1'])
    expect(
      await probeLatestVersion(
        { source: 'git-tag', remote: 'git@example.com:a/b.git' },
        env({ gitLsRemoteTags: tags })
      )
    ).toBe('0.10.0')
  })

  it('answers null when a private remote refuses, rather than throwing', async () => {
    const tags = vi.fn().mockRejectedValue(new Error('Permission denied (publickey).'))
    expect(
      await probeLatestVersion(
        { source: 'git-tag', remote: 'git@example.com:a/b.git' },
        env({ gitLsRemoteTags: tags })
      )
    ).toBeNull()
  })

  it('answers null for a registry that is down', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }))
    expect(
      await probeLatestVersion({ source: 'pypi', package: 'acme' }, env({ fetch: fetchMock }))
    ).toBeNull()
  })

  it('does not probe a pinned or bundled source at all', async () => {
    const probeEnv = env()
    expect(await probeLatestVersion({ source: 'pinned' }, probeEnv)).toBeNull()
    expect(await probeLatestVersion({ source: 'bundled' }, probeEnv)).toBeNull()
    expect(probeEnv.fetch).not.toHaveBeenCalled()
  })

  it('asks Agent Local for its own published version', async () => {
    const readLatest = vi.fn().mockResolvedValue('0.35.0')
    expect(
      await probeLatestVersion(
        { source: 'agent-local-daemon' },
        env({ readAgentLocalLatest: readLatest })
      )
    ).toBe('0.35.0')
  })
})
