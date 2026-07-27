// The branch a folder on disk currently has checked out, read straight out of `.git/HEAD`.
//
// The composer seeds a blank workspace name from the branch the user is already working on, taken
// from the project's main worktree row. A LocalWP site keeps its checkout at `app/public`, so Orca
// classifies it as a plain folder, its worktree row carries no branch, and the seed falls through
// to a random creature name. Reading HEAD recovers the branch without reclassifying the project.
//
// The on-disk reads, the candidate order and the bounded sweep all live in project-git-dir-probe.

import {
  readProjectGitDirFile,
  sweepProjectPaths,
  type ProjectPathSweepOptions
} from './project-git-dir-probe'

/**
 * `ref: refs/heads/<name>`, the whole of a HEAD file. Anchored end to end so a detached HEAD (a
 * bare SHA) and a symref outside `refs/heads` both miss: neither names a branch, and a SHA passed
 * off as one would seed a workspace called `a1b2c3d`.
 */
const HEAD_BRANCH_PATTERN = /^\s*ref:\s*refs\/heads\/(\S.*?)\s*$/

/**
 * The first readable git directory is authoritative, even when its HEAD is detached: a project with
 * its own repository is not described by whatever a nested WordPress checkout happens to be on.
 */
async function probeHeadBranch(dirPath: string): Promise<string | null> {
  for await (const headText of readProjectGitDirFile(dirPath, 'HEAD')) {
    return HEAD_BRANCH_PATTERN.exec(headText)?.[1] ?? null
  }
  return null
}

/**
 * Short branch names discovered on disk, keyed by the directory asked for. Best effort: a directory
 * with no repository, an unreadable one, or a detached HEAD is simply absent from the result.
 */
export async function probeRepoHeadBranches(
  paths: readonly string[],
  options?: ProjectPathSweepOptions
): Promise<Record<string, string>> {
  const branches = new Map<string, string>()
  await sweepProjectPaths(paths, options, async (dirPath) => {
    const branch = await probeHeadBranch(dirPath)
    if (branch !== null) {
      branches.set(dirPath, branch)
    }
  })
  return Object.fromEntries(branches)
}
