// IPC for the ActiveCollab MCP server's status and credential file.
//
// Follows ipc/site-bind.ts: a removeHandler prologue so a re-register cannot double up, and tagged
// SiteResult unions instead of exceptions — an error thrown across the bridge loses its type and
// its stack in the renderer.
//
// Nothing here returns the ActiveCollab token. `seedCredentials` writes it to the MCP server's own
// credential file in main and reports only the path and the account it was issued for.

import { ipcMain } from 'electron'
import type {
  ActiveCollabMcpSeedResult,
  ActiveCollabMcpStatus
} from '../../shared/activecollab-mcp-types'
import type { SiteResult } from '../../shared/site-types'
import {
  getActiveCollabMcpStatus,
  seedActiveCollabMcpCredentials
} from '../activecollab/mcp-install'
import { failure } from './sites-result'

const ACTIVECOLLAB_MCP_CHANNELS = [
  'activecollabMcp:status',
  // Retired: agents are registered through the Extension Hub. Still removed so a hot reload drops it.
  'activecollabMcp:install',
  'activecollabMcp:seedCredentials'
] as const

export function registerActiveCollabMcpHandlers(): void {
  for (const channel of ACTIVECOLLAB_MCP_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle('activecollabMcp:status', (): SiteResult<ActiveCollabMcpStatus> => {
    try {
      return { ok: true, value: getActiveCollabMcpStatus() }
    } catch (error) {
      return failure(error)
    }
  })

  // Why: the whole point of the feature — the agent inherits Muster's connection instead of the
  // user authenticating twice. A missing credential is a value, not an error (see seed result).
  ipcMain.handle('activecollabMcp:seedCredentials', (): SiteResult<ActiveCollabMcpSeedResult> => {
    try {
      return { ok: true, value: seedActiveCollabMcpCredentials() }
    } catch (error) {
      return failure(error)
    }
  })
}
