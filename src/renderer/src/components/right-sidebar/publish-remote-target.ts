import type { GitPushTarget } from '../../../../shared/types'
import {
  resolveRuntimeGitPublishRemote,
  type RuntimeGitContext
} from '@/runtime/runtime-git-client'

export type PublishPushTargetChoice =
  | { kind: 'publish'; pushTarget: GitPushTarget | undefined }
  | { kind: 'cancelled' }

// Why: with several remotes and no origin, git can't guess the destination, so ask before pushing.
export async function choosePublishPushTarget({
  context,
  pushTarget,
  branchName,
  pickPublishRemote
}: {
  context: RuntimeGitContext
  pushTarget: GitPushTarget | undefined
  branchName: string | null
  pickPublishRemote: (remotes: string[], branchName: string) => Promise<string | null>
}): Promise<PublishPushTargetChoice> {
  if (pushTarget || !branchName) {
    return { kind: 'publish', pushTarget }
  }
  // Why: a failed lookup (e.g. an older relay) falls back to the push, which reports problems itself.
  const resolution = await resolveRuntimeGitPublishRemote(context).catch(() => null)
  // Why: an empty list falls through to the push, which reports the missing remote in plain words.
  if (!resolution || !('needsChoice' in resolution) || resolution.remotes.length === 0) {
    return { kind: 'publish', pushTarget }
  }
  const remoteName = await pickPublishRemote(resolution.remotes, branchName)
  return remoteName
    ? { kind: 'publish', pushTarget: { remoteName, branchName } }
    : { kind: 'cancelled' }
}
