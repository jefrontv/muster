// Reading a project folder's git directory straight off disk, in batch.
//
// Two probes — the clone picker's remote key and the composer's head branch — need the same three
// things and must agree on them: which directories under a project folder can hold the checkout,
// how to reach the git directory behind a `.git` entry, and how to sweep a few hundred folders
// without holding a few hundred descriptors open at once.
//
// No `git` subprocess. These sweeps run over every known project at once, so spawning per folder
// would mean hundreds of processes for values that are one file read away.
//
// Best effort throughout: these are user directories that may be ejected, permission-denied or
// half-written. Every failure costs one missing value, never a rejection.

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { localWpWordPressRoot } from '../../shared/localwp-paths'

/**
 * Enough parallelism to hide read latency across a few hundred folders without holding a few
 * hundred descriptors open at once.
 */
const DEFAULT_PROBE_CONCURRENCY = 16

/** The `.git` file form used by worktrees and submodules: `gitdir: <path>`. */
const GITDIR_POINTER_PATTERN = /^\s*gitdir:\s*(.+)$/m

export type ProjectPathSweepOptions = { concurrency?: number; signal?: AbortSignal }

/**
 * `.git` is a directory holding the file almost everywhere, and a file pointing at one inside a
 * worktree or submodule. `workDir` is the directory containing the entry, which is what git
 * resolves a relative `gitdir:` against.
 */
async function readGitDirFile(workDir: string, fileName: string): Promise<string | null> {
  const gitEntryPath = join(workDir, '.git')
  try {
    // Read the directory case first: it is the common one, and its failure is also how the file
    // form is discovered, so the usual path costs a single syscall.
    return await readFile(join(gitEntryPath, fileName), 'utf-8')
  } catch {
    // Not a directory, or a directory without that file. Either way, try the pointer form.
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
    return await readFile(join(resolve(workDir, target), fileName), 'utf-8')
  } catch {
    return null
  }
}

/**
 * Yields `fileName` from the git directory of each checkout that can live under `dirPath`, skipping
 * candidates with no readable git directory. Lazy, so a project with a top-level repository never
 * pays for the nested read.
 *
 * Order matters and is not a preference. A LocalWP site has no top-level repository at all — the
 * checkout is the WordPress root two levels down — while an ordinary project has only the top-level
 * one, so the two are mutually exclusive in practice and the first hit is the answer. What counts
 * as a hit is the caller's to decide: stop at the first yield, or keep pulling until the text
 * parses into something usable.
 */
export async function* readProjectGitDirFile(
  dirPath: string,
  fileName: string
): AsyncGenerator<string> {
  for (const workDir of [dirPath, localWpWordPressRoot(dirPath)]) {
    const text = await readGitDirFile(workDir, fileName)
    if (text !== null) {
      yield text
    }
  }
}

/** Runs `visit` over every non-empty path with bounded concurrency. Best effort, abortable. */
export async function sweepProjectPaths(
  paths: readonly string[],
  options: ProjectPathSweepOptions | undefined,
  visit: (dirPath: string) => Promise<void>
): Promise<void> {
  const requested = Math.trunc(options?.concurrency ?? DEFAULT_PROBE_CONCURRENCY)
  // A zero or nonsense limit would silently probe nothing, which reads as "no repo is here".
  const concurrency =
    Number.isFinite(requested) && requested >= 1 ? requested : DEFAULT_PROBE_CONCURRENCY
  let nextIndex = 0

  async function visitNext(): Promise<void> {
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
        await visit(dirPath)
      } catch {
        // One malformed path must not cost the other few hundred their answer.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, () => visitNext()))
}
