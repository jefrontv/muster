import type { GitExec } from './git-handler-ops'
import {
  isGitStashAction,
  readBranchStashWithGit,
  runGitStashActionWithGit,
  type GitBranchStash,
  type GitStashResult
} from '../shared/git-stash'

export async function runStashActionOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitStashResult> {
  const worktreePath = params.worktreePath as string
  const action = params.action
  if (!isGitStashAction(action)) {
    throw new Error('Unsupported stash operation.')
  }
  return runGitStashActionWithGit((args) => git(args, worktreePath), action)
}

export async function readBranchStashOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitBranchStash> {
  const worktreePath = params.worktreePath as string
  return readBranchStashWithGit((args) => git(args, worktreePath))
}
