import { tmpdir } from 'node:os'
import type { RemoteBranchList } from '../../shared/remote-branches-api-types'
import { remoteGitEnv } from './bitbucket-ssh-trust'
import { gitExecFileAsync } from './runner'

const LIST_TIMEOUT_MS = 15_000
const HEADS_PREFIX = 'refs/heads/'
const FAILED: RemoteBranchList = { ok: false, branches: [], defaultBranch: null }

/** Parses `git ls-remote --symref <url> HEAD refs/heads/*`. */
export function parseLsRemoteHeads(stdout: string): Omit<RemoteBranchList, 'ok'> {
  const branches: string[] = []
  let defaultBranch: string | null = null
  for (const line of stdout.split('\n')) {
    const [left, right] = line.trim().split('\t')
    if (!left || !right) {
      continue
    }
    if (left.startsWith('ref: ') && right === 'HEAD') {
      const target = left.slice('ref: '.length)
      defaultBranch = target.startsWith(HEADS_PREFIX) ? target.slice(HEADS_PREFIX.length) : null
    } else if (right.startsWith(HEADS_PREFIX)) {
      branches.push(right.slice(HEADS_PREFIX.length))
    }
  }
  branches.sort((a, b) => a.localeCompare(b))
  return { branches, defaultBranch }
}

/** Best effort: any failure reports `ok: false` so setup falls back to the link's branch. */
export async function listRemoteBranches(url: string): Promise<RemoteBranchList> {
  // A leading dash would be read as an option; ls-remote has no '--' before the URL.
  if (url.length === 0 || url.startsWith('-')) {
    return FAILED
  }
  try {
    const { stdout } = await gitExecFileAsync(
      ['ls-remote', '--symref', url, 'HEAD', `${HEADS_PREFIX}*`],
      // cwd only picks the git binary/host; the call itself is remote-only.
      { cwd: tmpdir(), env: remoteGitEnv(url), timeout: LIST_TIMEOUT_MS }
    )
    return { ok: true, ...parseLsRemoteHeads(stdout) }
  } catch {
    return FAILED
  }
}
