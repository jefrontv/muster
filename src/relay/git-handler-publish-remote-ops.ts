import type { GitExec } from './git-handler-ops'
import { resolveRelayPushTarget } from './git-handler-push-target'
import {
  resolvePublishRemoteWithGit,
  type GitPublishRemoteResolution
} from '../shared/git-publish-remote'

export async function resolvePublishRemoteOp(
  git: GitExec,
  params: Record<string, unknown>
): Promise<GitPublishRemoteResolution> {
  const worktreePath = params.worktreePath as string
  const configured = await resolveRelayPushTarget(git, worktreePath, undefined)
  return resolvePublishRemoteWithGit((args) => git(args, worktreePath), configured?.remote ?? null)
}
