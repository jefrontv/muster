// Asks each entry's declared source what the newest published version is.
//
// Every probe is optional and every probe is bounded. A probe that fails does not fail the
// inventory: the entry falls back to the version pinned in the catalog, and the pane says it could
// not check rather than showing an error the user can do nothing about. That is the difference
// between a hub that degrades on a bad network and one that empties itself.

import { streamCommand } from '../lib/stream-command'
import type { ExtensionLatestSpec } from '../../shared/extension-catalog-types'

const PROBE_TIMEOUT_MS = 5_000
const MAX_PROBE_BYTES = 256 * 1024

export type VersionProbeEnv = {
  fetch: typeof globalThis.fetch
  /** Injected so tests never shell out and the agent-local path can be stubbed wholesale. */
  gitLsRemoteTags: (remote: string) => Promise<string[]>
  readAgentLocalLatest: () => Promise<string | null>
}

async function defaultGitLsRemoteTags(remote: string): Promise<string[]> {
  const result = await streamCommand('git', ['ls-remote', '--tags', '--refs', remote], {
    timeoutMs: PROBE_TIMEOUT_MS,
    maxBytes: MAX_PROBE_BYTES,
    // Why: without this a private remote prompts for credentials and the probe hangs until the
    // timeout on every scan, on every machine that lacks access.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' }
  })
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'git ls-remote failed')
  }
  return result.stdout
    .split('\n')
    .map((line) => line.split('refs/tags/')[1]?.trim())
    .filter((tag): tag is string => Boolean(tag))
}

export function createDefaultVersionProbeEnv(): VersionProbeEnv {
  return {
    fetch: globalThis.fetch,
    gitLsRemoteTags: defaultGitLsRemoteTags,
    readAgentLocalLatest: async () => {
      const { readAgentLocalDaemonStatus } = await import('../sites/agent-local-import-api')
      const status = await readAgentLocalDaemonStatus({ startDaemon: false })
      return status.latest.length > 0 ? status.latest : null
    }
  }
}

/** Numeric-aware so 0.10.0 sorts above 0.9.0, which a string compare gets backwards. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value
      .replace(/^v/, '')
      .split(/[.\-+]/)
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part))
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) {
      return difference > 0 ? 1 : -1
    }
  }
  return 0
}

export function isOutdated(installed: string | null, latest: string | null): boolean {
  if (installed === null || latest === null) {
    return false
  }
  return compareVersions(installed, latest) < 0
}

/** Pre-release tags are noise for an update prompt: nobody wants a hub nagging them onto an rc. */
function highestStableTag(tags: readonly string[]): string | null {
  const stable = tags.filter((tag) => /^v?\d+(\.\d+)*$/.test(tag))
  if (stable.length === 0) {
    return null
  }
  return stable.reduce((best, tag) => (compareVersions(tag, best) > 0 ? tag : best))
}

async function fetchJson(env: VersionProbeEnv, url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await env.fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`${response.status}`)
    }
    return JSON.parse((await response.text()).slice(0, MAX_PROBE_BYTES))
  } finally {
    clearTimeout(timer)
  }
}

function readString(value: unknown, ...path: string[]): string | null {
  let current = value
  for (const key of path) {
    if (typeof current !== 'object' || current === null) {
      return null
    }
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' && current.length > 0 ? current : null
}

/**
 * Null means "could not check", never "there is no update". The caller keeps the catalog's pinned
 * version in that case, so an unreachable registry can never mark an outdated entry current.
 */
export async function probeLatestVersion(
  spec: ExtensionLatestSpec,
  env: VersionProbeEnv = createDefaultVersionProbeEnv()
): Promise<string | null> {
  try {
    switch (spec.source) {
      case 'pypi': {
        const body = await fetchJson(env, `https://pypi.org/pypi/${spec.package}/json`)
        return readString(body, 'info', 'version')
      }
      case 'npm': {
        const body = await fetchJson(env, `https://registry.npmjs.org/${spec.package}/latest`)
        return readString(body, 'version')
      }
      case 'github-release': {
        const body = await fetchJson(
          env,
          `https://api.github.com/repos/${spec.repo}/releases/latest`
        )
        return readString(body, 'tag_name')?.replace(/^v/, '') ?? null
      }
      case 'git-tag': {
        const tag = highestStableTag(await env.gitLsRemoteTags(spec.remote))
        return tag ? tag.replace(/^v/, '') : null
      }
      case 'agent-local-daemon':
        return await env.readAgentLocalLatest()
      case 'pinned':
      case 'bundled':
        return null
    }
  } catch {
    return null
  }
}
