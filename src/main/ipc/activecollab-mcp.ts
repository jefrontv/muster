// IPC for the one-click ActiveCollab MCP install.
//
// Follows ipc/site-bind.ts: a removeHandler prologue so a re-register cannot double up, and tagged
// SiteResult unions instead of exceptions — an error thrown across the bridge loses its type and
// its stack in the renderer.
//
// Nothing here returns the ActiveCollab token. `seedCredentials` writes it to the MCP server's own
// credential file in main and reports only the path and the account it was issued for.

import { ipcMain } from 'electron'
import {
  ACTIVECOLLAB_MCP_AGENT_IDS,
  isActiveCollabMcpAgentId,
  type ActiveCollabMcpAgentId,
  type ActiveCollabMcpInstallResult,
  type ActiveCollabMcpSeedResult,
  type ActiveCollabMcpStatus
} from '../../shared/activecollab-mcp-types'
import type { SiteResult } from '../../shared/site-types'
import {
  getActiveCollabMcpStatus,
  installActiveCollabMcpForAgents,
  seedActiveCollabMcpCredentials
} from '../activecollab/mcp-install'
import { failure } from './sites-result'

const ACTIVECOLLAB_MCP_CHANNELS = [
  'activecollabMcp:status',
  'activecollabMcp:install',
  'activecollabMcp:seedCredentials'
] as const

/**
 * Validated against the runtime id list, not just `string[]`: an unknown id would otherwise reach
 * the adapter lookup and read as an internal error rather than a rejected request.
 */
function readAgentIds(args: unknown): ActiveCollabMcpAgentId[] {
  const input = (args ?? {}) as { agentIds?: unknown }
  if (!Array.isArray(input.agentIds) || input.agentIds.length === 0) {
    throw new TypeError('activecollabMcp:install requires a non-empty agentIds array.')
  }
  if (input.agentIds.length > ACTIVECOLLAB_MCP_AGENT_IDS.length) {
    throw new TypeError('activecollabMcp:install received more agent ids than agents exist.')
  }
  const ids: ActiveCollabMcpAgentId[] = []
  for (const candidate of input.agentIds) {
    if (!isActiveCollabMcpAgentId(candidate)) {
      const shown = typeof candidate === 'string' ? candidate : typeof candidate
      throw new TypeError(`Unknown MCP agent id: ${shown}.`)
    }
    // Duplicates would write the same config twice and report two results for one agent.
    if (!ids.includes(candidate)) {
      ids.push(candidate)
    }
  }
  return ids
}

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

  ipcMain.handle(
    'activecollabMcp:install',
    (_event, args: unknown): SiteResult<ActiveCollabMcpInstallResult> => {
      try {
        return { ok: true, value: installActiveCollabMcpForAgents(readAgentIds(args)) }
      } catch (error) {
        return failure(error)
      }
    }
  )

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
