// The canonical git remote a folder on disk already points at, read straight out of `.git/config`.
//
// The clone picker hides repos the user already has, and the store can only answer that for records
// carrying `gitRemoteIdentity` — roughly half of them predate it. LocalWP sites are worse: the
// checkout is the WordPress root under `app/public`, and Local names the folder after the client,
// so neither the stored key nor the folder name matches the repo. Reading the config is the only
// signal that covers them.
//
// The on-disk reads, the candidate order and the bounded sweep all live in project-git-dir-probe.

import { normalizeGitRemoteUrl } from '../../shared/git-remote-identity'
import {
  readProjectGitDirFile,
  sweepProjectPaths,
  type ProjectPathSweepOptions
} from './project-git-dir-probe'

/** `[remote "origin"]`. Git treats section names as case-insensitive; subsection names are not. */
const REMOTE_SECTION_PATTERN = /^\[\s*remote\s+"([^"]*)"\s*\]$/i
const URL_ASSIGNMENT_PATTERN = /^url\s*=\s*(.+)$/i

/**
 * Only `[remote "..."] url = ...` is of interest, so every other section is skipped wholesale
 * rather than modelled. `origin` wins when present; otherwise the first remote in file order, which
 * is the only stable choice when a config names several.
 */
function findRemoteUrl(configText: string): string | null {
  let originUrl = ''
  let firstUrl = ''
  let remoteName: string | null = null
  // Splitting on '\n' alone is safe because the trim below eats a trailing '\r'.
  for (const rawLine of configText.split('\n')) {
    // Git honours '#' and ';' as comment markers anywhere on a line, not just at its start.
    const hash = rawLine.indexOf('#')
    const semicolon = rawLine.indexOf(';')
    const commentAt = hash < 0 ? semicolon : semicolon < 0 ? hash : Math.min(hash, semicolon)
    const line = (commentAt < 0 ? rawLine : rawLine.slice(0, commentAt)).trim()
    if (line.startsWith('[')) {
      remoteName = REMOTE_SECTION_PATTERN.exec(line)?.[1] ?? null
      continue
    }
    if (remoteName === null || line.length === 0) {
      continue
    }
    const url = URL_ASSIGNMENT_PATTERN.exec(line)?.[1]?.trim()
    if (url === undefined || url.length === 0) {
      continue
    }
    if (remoteName === 'origin' && originUrl.length === 0) {
      originUrl = url
    }
    if (firstUrl.length === 0) {
      firstUrl = url
    }
  }
  return originUrl.length > 0 ? originUrl : firstUrl.length > 0 ? firstUrl : null
}

/**
 * A config naming no usable remote is not an answer, so the walk keeps pulling candidates: a
 * LocalWP-shaped folder can carry a top-level repository that names no host alongside the real
 * checkout nested under it.
 */
async function probeRemoteKey(dirPath: string): Promise<string | null> {
  for await (const configText of readProjectGitDirFile(dirPath, 'config')) {
    const remoteUrl = findRemoteUrl(configText)
    // normalizeGitRemoteUrl returns null for a local filesystem remote, which names no host and so
    // can never match a repo a git host offered.
    const key = remoteUrl === null ? null : normalizeGitRemoteUrl(remoteUrl)
    if (key !== null && key.length > 0) {
      return key
    }
  }
  return null
}

/** Canonical remote keys discovered on disk for the given directories. Best effort. */
export async function probeRepoRemoteKeys(
  paths: readonly string[],
  options?: ProjectPathSweepOptions
): Promise<Set<string>> {
  const keys = new Set<string>()
  await sweepProjectPaths(paths, options, async (dirPath) => {
    const key = await probeRemoteKey(dirPath)
    if (key !== null) {
      keys.add(key)
    }
  })
  return keys
}
