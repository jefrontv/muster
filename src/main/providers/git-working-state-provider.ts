import type {
  GitSequencerAction,
  GitSequencerActionResult
} from '../../shared/git-sequencer-action'
import type { GitPublishRemoteResolution } from '../../shared/git-publish-remote'

// Git provider methods for in-progress operations, publish target and stashes, split out of IGitProvider's file budget.
export type GitWorkingStateProvider = {
  runSequencerAction(
    worktreePath: string,
    action: GitSequencerAction
  ): Promise<GitSequencerActionResult>
  readMergeMessage(worktreePath: string): Promise<string | null>
  resolvePublishRemote(worktreePath: string): Promise<GitPublishRemoteResolution>
}
