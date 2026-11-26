// IPC for listing a remote's branches before it is cloned (muster:// setup's branch picker).

import { ipcMain } from 'electron'
import type { RemoteBranchList } from '../../shared/remote-branches-api-types'
import { listRemoteBranches } from '../git/remote-branch-list'

const MAX_URL_LENGTH = 2048

export function registerRemoteBranchesHandlers(): void {
  ipcMain.removeHandler('remoteBranches:list')
  ipcMain.handle(
    'remoteBranches:list',
    async (_event, args: unknown): Promise<RemoteBranchList> => {
      const url = (args as { url?: unknown } | null)?.url
      if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) {
        return { ok: false, branches: [], defaultBranch: null }
      }
      return listRemoteBranches(url.trim())
    }
  )
}
