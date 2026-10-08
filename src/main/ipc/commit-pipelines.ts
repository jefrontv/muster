import { ipcMain } from 'electron'
import type { CommitPipelinesArgs, CommitPipelinesResult } from '../../shared/commit-pipelines'
import type { Store } from '../persistence'
import { getCommitPipelines, normalizeCommitShas } from '../source-control/commit-pipelines'
import { resolveRegisteredWorktreePath } from './filesystem-auth'
import { getLocalGitOptionsForRegisteredWorktree } from './local-worktree-runtime-options'

export function registerCommitPipelinesHandlers(store: Store): void {
  ipcMain.removeHandler('git:commitPipelines')
  ipcMain.handle(
    'git:commitPipelines',
    async (_event, args: CommitPipelinesArgs): Promise<CommitPipelinesResult> => {
      const shas = normalizeCommitShas(args?.shas)
      if (typeof args?.worktreePath !== 'string') {
        return { available: false, reason: 'no-provider' }
      }
      if (args.connectionId) {
        // Why: SSH paths are remote; the SSH git provider reads origin on the remote host.
        return getCommitPipelines(
          { repoPath: args.worktreePath, connectionId: args.connectionId },
          shas
        )
      }
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const localGitExecOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return getCommitPipelines({ repoPath: worktreePath, localGitExecOptions }, shas)
    }
  )
}
