import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import type { IGitProvider } from '../providers/types'
import { resolveRegisteredWorktreePath } from './filesystem-auth'
import { getLocalGitOptionsForRegisteredWorktree } from './local-worktree-runtime-options'
import type { GitRuntimeOptions } from '../git/git-runtime-options'
import {
  isGitSequencerAction,
  type GitSequencerAction,
  type GitSequencerActionResult
} from '../../shared/git-sequencer-action'
import { readPreparedMergeMessage, runGitSequencerAction } from '../git/sequencer'
import type { GitPublishRemoteResolution } from '../../shared/git-publish-remote'
import { resolveGitPublishRemote } from '../git/publish-remote'

type WorktreeArgs = { worktreePath: string; connectionId?: string }

function requireSshGitProvider(connectionId: string): IGitProvider {
  const provider = getSshGitProvider(connectionId)
  if (!provider) {
    throw new Error(`No git provider for connection "${connectionId}"`)
  }
  return provider
}

async function resolveLocalWorktree(
  store: Store,
  requestedPath: string
): Promise<{ worktreePath: string; gitOptions: GitRuntimeOptions }> {
  const worktreePath = await resolveRegisteredWorktreePath(requestedPath, store)
  const gitOptions = getLocalGitOptionsForRegisteredWorktree(store, requestedPath, worktreePath)
  return { worktreePath, gitOptions }
}

// Why: in-progress operation actions, the merge message prefill and the publish remote lookup, kept out of the large filesystem handler file.
export function registerGitInProgressOperationHandlers(store: Store): void {
  ipcMain.handle(
    'git:sequencerAction',
    async (
      _event,
      args: WorktreeArgs & { action: GitSequencerAction }
    ): Promise<GitSequencerActionResult> => {
      if (!isGitSequencerAction(args.action)) {
        throw new Error('Unsupported git operation.')
      }
      if (args.connectionId) {
        return requireSshGitProvider(args.connectionId).runSequencerAction(
          args.worktreePath,
          args.action
        )
      }
      const { worktreePath, gitOptions } = await resolveLocalWorktree(store, args.worktreePath)
      return runGitSequencerAction(worktreePath, args.action, gitOptions)
    }
  )

  ipcMain.handle('git:mergeMessage', async (_event, args: WorktreeArgs): Promise<string | null> => {
    if (args.connectionId) {
      return requireSshGitProvider(args.connectionId).readMergeMessage(args.worktreePath)
    }
    const { worktreePath } = await resolveLocalWorktree(store, args.worktreePath)
    return readPreparedMergeMessage(worktreePath)
  })

  ipcMain.handle(
    'git:publishRemote',
    async (_event, args: WorktreeArgs): Promise<GitPublishRemoteResolution> => {
      if (args.connectionId) {
        return requireSshGitProvider(args.connectionId).resolvePublishRemote(args.worktreePath)
      }
      const { worktreePath, gitOptions } = await resolveLocalWorktree(store, args.worktreePath)
      return resolveGitPublishRemote(worktreePath, gitOptions)
    }
  )
}
