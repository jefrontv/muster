// IPC for the on-disk head-branch probe behind the composer's workspace-name seed.
//
// Follows ipc/localwp-cert.ts: a removeHandler prologue so a re-register cannot double-bind, and
// bounded validation on every argument.
//
// No SiteResult wrapper here, unlike its neighbours. The probe cannot fail — a directory it cannot
// read is simply absent from the map — and its one caller treats a missing branch and a failed
// lookup identically, so a tagged union would only give the renderer a branch with nothing in it.
// A malformed call is answered the same way, for the same reason.

import { ipcMain } from 'electron'
import { probeRepoHeadBranches } from '../sites/repo-head-branch-probe'

const REPO_HEAD_BRANCH_CHANNELS = ['repoHeadBranch:probe'] as const

/** The composer probes the one selected project; the bound only stops a runaway caller. */
const MAX_PROBE_PATHS = 500

export function registerRepoHeadBranchHandlers(): void {
  for (const channel of REPO_HEAD_BRANCH_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'repoHeadBranch:probe',
    async (_event, args: unknown): Promise<Record<string, string>> => {
      const input = (args ?? {}) as { paths?: unknown }
      if (!Array.isArray(input.paths)) {
        return {}
      }
      const paths = input.paths
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        .slice(0, MAX_PROBE_PATHS)
      return paths.length === 0 ? {} : probeRepoHeadBranches(paths)
    }
  )
}
