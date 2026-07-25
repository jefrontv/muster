// git status for the get_git_status tool, ported from ocsites mcp_server.py:3000.
//
// commandExecFileAsync rather than a raw spawn, so WSL cwd translation and the Windows shim
// resolution come from Orca's git runner instead of being reinvented here. Every probe is
// individually fail-soft: a site on an unmounted drive reports "not a git repository" rather than
// failing the whole tool call.

import { commandExecFileAsync } from '../../git/runner'
import type { SiteGitStatus } from './site-mcp-context'

const GIT_TIMEOUT_MS = 5_000

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await commandExecFileAsync('git', args, { cwd, timeout: GIT_TIMEOUT_MS })
    return stdout.trim()
  } catch {
    return null
  }
}

async function countRevisions(cwd: string, range: string): Promise<number> {
  const output = await git(cwd, ['rev-list', '--count', range])
  const parsed = output === null ? Number.NaN : Number.parseInt(output, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function readSiteGitStatus(sitePath: string): Promise<SiteGitStatus | null> {
  const branch = await git(sitePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === null) {
    return null
  }
  const [remoteUrl, lastCommit, dirtyOutput, upstream] = await Promise.all([
    git(sitePath, ['config', '--get', 'remote.origin.url']),
    git(sitePath, ['log', '-1', '--format=%h %s (%cr by %an)']),
    git(sitePath, ['status', '--porcelain']),
    git(sitePath, ['rev-parse', '--symbolic-full-name', '@{u}'])
  ])
  const hasUpstream = upstream !== null && upstream.length > 0
  // Ahead/behind are only meaningful against a configured upstream; asking without one just
  // produces two more failed git invocations per call.
  const [behind, ahead] = hasUpstream
    ? await Promise.all([
        countRevisions(sitePath, 'HEAD..@{u}'),
        countRevisions(sitePath, '@{u}..HEAD')
      ])
    : [0, 0]
  const dirtyLines = (dirtyOutput ?? '').split('\n').filter((line) => line.trim().length > 0)
  return {
    branch,
    detached_head: branch === 'HEAD',
    remote_url: remoteUrl ?? '',
    has_upstream: hasUpstream,
    ahead,
    behind,
    last_commit: lastCommit ?? '',
    dirty: dirtyLines.length > 0,
    dirty_file_count: dirtyLines.length
  }
}
