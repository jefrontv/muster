import type {
  GitSequencerAction,
  GitSequencerActionResult
} from '../../shared/git-sequencer-action'

// Git provider methods for in-progress operations and stashes, split out of IGitProvider's file budget.
export type GitWorkingStateProvider = {
  runSequencerAction(
    worktreePath: string,
    action: GitSequencerAction
  ): Promise<GitSequencerActionResult>
  readMergeMessage(worktreePath: string): Promise<string | null>
}
