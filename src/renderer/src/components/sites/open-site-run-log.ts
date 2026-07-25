// Opens a run's persisted log as a read-only, live-tailing Monaco tab.
//
// The run console shows the tail inline, but a long import produces thousands of lines and the
// console is bounded. A real editor tab gives find-in-file, unbounded scrollback, and survives
// navigating away — for free, via the existing `readOnly + liveTail` OpenFile contract.
// Shaped after ai-vault-session-log-open.ts, which is the house template for this.

import { toast } from 'sonner'
import type { SiteRun } from '../../../../shared/site-run-types'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

// A double-click must not open two tabs while the authorization await is in flight.
const inFlightOpenPaths = new Set<string>()

export async function openSiteRunLog(run: SiteRun): Promise<void> {
  const filePath = run.logPath
  if (!filePath || inFlightOpenPaths.has(filePath)) {
    return
  }
  inFlightOpenPaths.add(filePath)
  try {
    const state = useAppStore.getState()
    // Snapshot before the await: a slow grant must not retarget the tab into whatever workspace
    // the user switched to in the meantime.
    const worktreeId = state.activeWorktreeId
    if (!worktreeId) {
      toast.error(
        translate(
          'auto.components.sites.openSiteRunLog.noWorkspace',
          'Open a workspace first — run logs open as an editor tab.'
        )
      )
      return
    }
    const targetGroupId = state.activeGroupIdByWorktree?.[worktreeId] ?? undefined

    try {
      await window.api.fs.authorizeExternalPath({ targetPath: filePath })
    } catch {
      toast.error(
        translate(
          'auto.components.sites.openSiteRunLog.notAuthorized',
          'Could not open the run log.'
        )
      )
      return
    }

    const afterAuth = useAppStore.getState()
    if (afterAuth.activeWorktreeId !== worktreeId) {
      return
    }

    afterAuth.openFile(
      {
        filePath,
        // liveTail requires relativePath === filePath and a null runtime; the log is always local.
        relativePath: filePath,
        worktreeId,
        runtimeEnvironmentId: null,
        language: 'log',
        mode: 'edit',
        readOnly: true,
        liveTail: true
      },
      {
        preview: false,
        forceContentReload: true,
        suppressActiveRuntimeFallback: true,
        targetGroupId
      }
    )
  } finally {
    inFlightOpenPaths.delete(filePath)
  }
}
