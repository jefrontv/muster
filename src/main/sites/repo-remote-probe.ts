// The canonical git remote a folder on disk already points at, read straight out of `.git/config`.
//
// The clone picker hides repos the user already has, and the store can only answer that for records
// carrying `gitRemoteIdentity` — roughly half of them predate it. LocalWP sites are worse: the
// checkout is the WordPress root under `app/public`, and Local names the folder after the client,
// so neither the stored key nor the folder name matches the repo. Reading the config is the only
// signal that covers them.
//
// No `git` subprocess. Opening the picker sweeps every site root at once, so spawning per folder
// would mean hundreds of processes for a value that is one file read away.
//
// Best effort throughout: these are user directories that may be ejected, permission-denied or
// half-written. Every failure costs one missing key, never a rejection.

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { normalizeGitRemoteUrl } from '../../shared/git-remote-identity'
import { localWpWordPressRoot } from './localwp-host'

/**
 * Enough parallelism to hide read latency across a few hundred folders without holding a few
 * hundred descriptors open at once.
 */
const DEFAULT_PROBE_CONCURRENCY = 16

/** `[remote "origin"]`. Git treats section names as case-insensitive; subsection names are not. */
const REMOTE_SECTION_PATTERN = /^\[\s*remote\s+"([^"]*)"\s*\]$/i
const URL_ASSIGNMENT_PATTERN = /^url\s*=\s*(.+)$/i
/** The `.git` file form used by worktrees and submodules: `gitdir: <path>`. */
const GITDIR_POINTER_PATTERN = /^\s*gitdir:\s*(.+)$/m

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
 * `.git` is a directory holding `config` almost everywhere, and a file pointing at one inside a
 * worktree or submodule. `workDir` is the directory containing the entry, which is what git
 * resolves a relative `gitdir:` against.
 */
async function readGitConfig(gitEntryPath: string, workDir: string): Promise<string | null> {
  try {
    // Read the directory case first: it is the common one, and its failure is also how the file
    // form is discovered, so the usual path costs a single syscall.
    return await readFile(join(gitEntryPath, 'config'), 'utf-8')
  } catch {
    // Not a directory, or a directory with no config. Either way, try the pointer form.
  }
  let pointerText: string
  try {
    pointerText = await readFile(gitEntryPath, 'utf-8')
  } catch {
    return null
  }
  const target = GITDIR_POINTER_PATTERN.exec(pointerText)?.[1]?.trim()
  if (target === undefined || target.length === 0) {
    return null
  }
  try {
    // One hop only: git always points a `.git` file at a real git directory, so a pointer to
    // another pointer is corruption rather than a chain worth walking.
    return await readFile(join(resolve(workDir, target), 'config'), 'utf-8')
  } catch {
    return null
  }
}

/**
 * Order matters and is not a preference. A LocalWP site has no top-level repository at all — the
 * checkout is the WordPress root two levels down — while an ordinary project has only the top-level
 * one, so the two probes are mutually exclusive in practice and the first hit is the answer.
 */
async function probeRemoteKey(dirPath: string): Promise<string | null> {
  for (const workDir of [dirPath, localWpWordPressRoot(dirPath)]) {
    const configText = await readGitConfig(join(workDir, '.git'), workDir)
    if (configText === null) {
      continue
    }
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
  options?: { concurrency?: number; signal?: AbortSignal }
): Promise<Set<string>> {
  const keys = new Set<string>()
  const requested = Math.trunc(options?.concurrency ?? DEFAULT_PROBE_CONCURRENCY)
  // A zero or nonsense limit would silently probe nothing, which reads as "no repo is here".
  const concurrency =
    Number.isFinite(requested) && requested >= 1 ? requested : DEFAULT_PROBE_CONCURRENCY
  let nextIndex = 0

  async function probeNext(): Promise<void> {
    while (nextIndex < paths.length) {
      if (options?.signal?.aborted) {
        return
      }
      const dirPath = paths[nextIndex]
      nextIndex += 1
      if (dirPath === undefined || dirPath.length === 0) {
        continue
      }
      try {
        const key = await probeRemoteKey(dirPath)
        if (key !== null) {
          keys.add(key)
        }
      } catch {
        // One malformed path must not cost the other few hundred their answer.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, () => probeNext()))
  return keys
}
