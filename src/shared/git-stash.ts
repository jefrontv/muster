// Shared by local git (main) and the SSH relay so stash and pop behave the same on every host.
import {
  describeGitConflictFailure,
  describeGitLockFailure,
  gitErrorOutputText,
  STASH_POP_CONFLICT_MESSAGE
} from './git-failure-detail'
import { appendGitFailureTail, stripCredentialsFromMessage } from './git-remote-error'

export const GIT_STASH_ACTIONS = ['push', 'pop'] as const

export type GitStashAction = (typeof GIT_STASH_ACTIONS)[number]

export type GitStashResult = {
  // False when there was nothing to stash.
  changed: boolean
  // Set when pop applied the stash but left conflicts behind.
  conflictMessage: string | null
}

export type GitStashEntry = { ref: string; subject: string }

// The newest stash made on the checked-out branch; branch is null on a detached HEAD.
export type GitBranchStash = { branch: string | null; stash: GitStashEntry | null }

type RunGit = (args: string[]) => Promise<{ stdout: string }>

const NOTHING_TO_STASH_PATTERN = /No local changes to save/i
const NO_STASH_PATTERN =
  /No stash entries found|is not a valid reference|is not a stash-like commit/i
const UNMERGED_PATTERN = /needs merge|you need to resolve your current index first|unmerged/i
const LOCAL_CHANGES_PATTERN = /Your local changes to the following files would be overwritten/i
const UNTRACKED_EXISTS_PATTERN = /already exists, no checkout|could not restore untracked files/i
// Why: git writes "WIP on <branch>: …" or "On <branch>: …"; branch names cannot contain ':'.
const STASH_SUBJECT_BRANCH_PATTERN = /^(?:WIP on|On) ([^:]+):/
const STASH_REF_PATTERN = /^stash@\{\d+\}$/

export function isGitStashAction(value: unknown): value is GitStashAction {
  return typeof value === 'string' && (GIT_STASH_ACTIONS as readonly string[]).includes(value)
}

export function stashSubjectBranch(subject: string): string | null {
  return subject.match(STASH_SUBJECT_BRANCH_PATTERN)?.[1] ?? null
}

export function noStashForBranchMessage(branch: string): string {
  return `No stash for ${branch}`
}

export function normalizeGitStashErrorMessage(error: unknown, action: GitStashAction): string {
  const fallback = action === 'push' ? 'Could not stash changes.' : 'Could not pop the stash.'
  if (!(error instanceof Error)) {
    return fallback
  }
  const output = stripCredentialsFromMessage(gitErrorOutputText(error))
  const lockFailure = describeGitLockFailure(output)
  if (lockFailure) {
    return lockFailure
  }
  if (action === 'pop' && NO_STASH_PATTERN.test(output)) {
    return 'That stash no longer exists. Refresh Source Control and try again.'
  }
  if (UNMERGED_PATTERN.test(output)) {
    return 'Resolve the conflicted files first.'
  }
  if (LOCAL_CHANGES_PATTERN.test(output)) {
    return 'Popping would overwrite local changes. Commit or discard them first.'
  }
  if (UNTRACKED_EXISTS_PATTERN.test(output)) {
    return 'Popping would overwrite untracked files. Move or remove them first.'
  }
  return appendGitFailureTail(error, fallback)
}

async function readCurrentBranch(runGit: RunGit): Promise<string | null> {
  try {
    return (await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim() || null
  } catch {
    return null
  }
}

export async function readBranchStashWithGit(runGit: RunGit): Promise<GitBranchStash> {
  const branch = await readCurrentBranch(runGit)
  if (!branch) {
    return { branch: null, stash: null }
  }
  let stdout = ''
  try {
    // Why: %gd is the stash@{n} selector; NUL keeps it apart from a subject that may contain anything.
    stdout = (await runGit(['stash', 'list', '--format=%gd%x00%gs'])).stdout
  } catch {
    return { branch, stash: null }
  }
  for (const line of stdout.split(/\r?\n/)) {
    const [ref, subject] = line.split('\0')
    if (ref && subject && STASH_REF_PATTERN.test(ref) && stashSubjectBranch(subject) === branch) {
      return { branch, stash: { ref, subject } }
    }
  }
  return { branch, stash: null }
}

class StashRefusal extends Error {}

async function popBranchStash(runGit: RunGit): Promise<void> {
  const { branch, stash } = await readBranchStashWithGit(runGit)
  if (!branch) {
    throw new StashRefusal('Check out a branch to pop its stash.')
  }
  if (!stash) {
    throw new StashRefusal(noStashForBranchMessage(branch))
  }
  // Why: the stash list is shared by every worktree of the repo, so pop this branch's entry, not stash@{0}.
  await runGit(['stash', 'pop', stash.ref])
}

export async function runGitStashActionWithGit(
  runGit: RunGit,
  action: GitStashAction
): Promise<GitStashResult> {
  try {
    if (action === 'push') {
      // Why: -u so new files are stashed too; otherwise they stay behind and look unstashed.
      const { stdout } = await runGit(['stash', 'push', '-u'])
      return { changed: !NOTHING_TO_STASH_PATTERN.test(stdout), conflictMessage: null }
    }
    await popBranchStash(runGit)
    return { changed: true, conflictMessage: null }
  } catch (error) {
    // Why: a conflicting pop still applies the stash (and keeps the entry), so report it, don't fail.
    if (
      action === 'pop' &&
      error instanceof Error &&
      describeGitConflictFailure(gitErrorOutputText(error))
    ) {
      return { changed: true, conflictMessage: STASH_POP_CONFLICT_MESSAGE }
    }
    throw new Error(
      error instanceof StashRefusal ? error.message : normalizeGitStashErrorMessage(error, action)
    )
  }
}
