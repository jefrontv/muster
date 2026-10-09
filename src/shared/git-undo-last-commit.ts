// Shared by local git (main) and the SSH relay so both run the same command sequence.
import { describeGitLockFailure, gitErrorOutputText } from './git-failure-detail'
import { appendGitFailureTail, stripCredentialsFromMessage } from './git-remote-error'

export const NO_COMMITS_TO_UNDO_MESSAGE = 'No commits to undo'
export const MERGE_COMMIT_UNDO_MESSAGE = "Can't undo a merge commit here"

export type GitUndoLastCommitResult = {
  // The undone commit's full message, so the renderer can restore it into the commit box.
  message: string
}

type RunGit = (args: string[]) => Promise<{ stdout: string }>

class UndoRefusal extends Error {}

export function normalizeGitUndoErrorMessage(error: unknown): string {
  const fallback = 'Could not undo the last commit.'
  if (!(error instanceof Error)) {
    return fallback
  }
  return (
    describeGitLockFailure(stripCredentialsFromMessage(gitErrorOutputText(error))) ??
    appendGitFailureTail(error, fallback)
  )
}

async function undoLastCommitSteps(runGit: RunGit): Promise<GitUndoLastCommitResult> {
  try {
    await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'])
  } catch {
    throw new UndoRefusal(NO_COMMITS_TO_UNDO_MESSAGE)
  }
  const { stdout: parentsLine } = await runGit(['rev-list', '--parents', '-n', '1', 'HEAD'])
  const [head, ...parents] = parentsLine.trim().split(/\s+/)
  if (!head) {
    throw new UndoRefusal(NO_COMMITS_TO_UNDO_MESSAGE)
  }
  // Why: a soft reset of a merge would stage the other branch's changes as if they were the user's.
  if (parents.length > 1) {
    throw new UndoRefusal(MERGE_COMMIT_UNDO_MESSAGE)
  }
  const { stdout: message } = await runGit(['log', '-1', '--format=%B', head])
  // Why: a root commit has no parent to reset to; deleting the branch ref (guarded by its old
  // value) leaves the files staged on an unborn branch, matching VS Code.
  await runGit(
    parents.length === 0 ? ['update-ref', '-d', 'HEAD', head] : ['reset', '--soft', parents[0]]
  )
  return { message: message.trimEnd() }
}

export async function undoLastCommitWithGit(runGit: RunGit): Promise<GitUndoLastCommitResult> {
  try {
    return await undoLastCommitSteps(runGit)
  } catch (error) {
    // Why: raw git failures (e.g. index.lock) arrive wrapped in "Command failed: git …"; show the plain sentence.
    throw new Error(
      error instanceof UndoRefusal ? error.message : normalizeGitUndoErrorMessage(error)
    )
  }
}
