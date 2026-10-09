import {
  resolvePublishRemoteWithGit,
  type GitPublishRemoteResolution
} from '../../shared/git-publish-remote'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './git-runtime-options'
import { getConfiguredPushTarget } from './remote'
import { gitExecFileAsync } from './runner'

export async function resolveGitPublishRemote(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitPublishRemoteResolution> {
  const configured = await getConfiguredPushTarget(worktreePath, options)
  return resolvePublishRemoteWithGit(
    (args) => gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options)),
    configured?.remote ?? null
  )
}
