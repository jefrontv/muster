import {
  readBranchStashWithGit,
  runGitStashActionWithGit,
  type GitBranchStash,
  type GitStashAction,
  type GitStashResult
} from '../../shared/git-stash'
import { gitExecFileAsync } from './runner'
import { runWithGitReadCacheInvalidation } from './status'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './git-runtime-options'

export async function runGitStashAction(
  worktreePath: string,
  action: GitStashAction,
  options: GitRuntimeOptions = {}
): Promise<GitStashResult> {
  return runWithGitReadCacheInvalidation(() =>
    runGitStashActionWithGit(
      (args) => gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options)),
      action
    )
  )
}

export async function readBranchStash(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitBranchStash> {
  return readBranchStashWithGit((args) =>
    gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
  )
}
