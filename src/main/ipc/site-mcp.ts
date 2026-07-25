// IPC for the built-in site MCP server: what it exposes, and whether an agent in a given project
// is wired up to it.
//
// Handlers never throw across the bridge — an exception loses its type and its stack in the
// renderer — so every channel returns the tagged SiteResult union, matching ipc/sites.ts.
//
// There is nothing to start or stop here. The server is spawned per-agent by the agent itself
// (stdio MCP), so "status" means "is the muster-sites entry present and pointing at this build",
// and register/unregister only ever touch a config file.

import { ipcMain } from 'electron'
import type { SiteResult } from '../../shared/site-types'
import { listSiteMcpToolDescriptors, SITE_MCP_SERVER_NAME } from '../sites/mcp/site-mcp-tools'
import {
  DEFAULT_SITE_MCP_CONFIG_PATH,
  readSiteMcpTargets,
  registerSiteMcpServer,
  resolveSiteMcpCommand,
  unregisterSiteMcpServer
} from './site-mcp-registration'
import type {
  SiteMcpStatus,
  SiteMcpToolInfo,
  SiteMcpWriteResult
} from '../../shared/site-mcp-types'
import type { Store } from '../persistence'
import { autoRegisterSiteMcpServers } from '../sites/site-mcp-autoregister'
import { failure } from './sites-result'

export type { SiteMcpStatus, SiteMcpToolInfo, SiteMcpWriteResult }

const SITE_MCP_CHANNELS = ['siteMcp:status', 'siteMcp:register', 'siteMcp:unregister'] as const

function readArgs(args: unknown): { rootPath: string; configPath: string } {
  const input = (args ?? {}) as { rootPath?: unknown; configPath?: unknown }
  if (typeof input.rootPath !== 'string') {
    throw new TypeError('An absolute project path is required.')
  }
  return {
    rootPath: input.rootPath,
    configPath:
      typeof input.configPath === 'string' && input.configPath.length > 0
        ? input.configPath
        : DEFAULT_SITE_MCP_CONFIG_PATH
  }
}

export function registerSiteMcpHandlers(store: Store): void {
  for (const channel of SITE_MCP_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  // Repair every already-registered entry whose command points at a moved or upgraded build, so
  // an agent's site tools keep working across app updates without anyone re-registering by hand.
  try {
    const repaired = autoRegisterSiteMcpServers(store)
    if (repaired.repaired.length > 0) {
      console.info(`[site-mcp] refreshed ${repaired.repaired.length} stale MCP registration(s)`)
    }
  } catch (error) {
    console.warn('[site-mcp] auto-registration skipped', error)
  }

  ipcMain.handle('siteMcp:status', (_event, args: unknown): SiteResult<SiteMcpStatus> => {
    try {
      const rootPath = (args as { rootPath?: unknown } | null)?.rootPath
      return {
        ok: true,
        value: {
          serverName: SITE_MCP_SERVER_NAME,
          command: resolveSiteMcpCommand(),
          tools: listSiteMcpToolDescriptors().map((tool) => ({
            name: tool.name,
            description: tool.description
          })),
          targets:
            typeof rootPath === 'string' && rootPath.length > 0 ? readSiteMcpTargets(rootPath) : [],
          defaultConfigPath: DEFAULT_SITE_MCP_CONFIG_PATH
        }
      }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteMcp:register', (_event, args: unknown): SiteResult<SiteMcpWriteResult> => {
    try {
      const { rootPath, configPath } = readArgs(args)
      return {
        ok: true,
        value: {
          configPath: registerSiteMcpServer(rootPath, configPath),
          targets: readSiteMcpTargets(rootPath)
        }
      }
    } catch (error) {
      return failure(error)
    }
  })

  ipcMain.handle('siteMcp:unregister', (_event, args: unknown): SiteResult<SiteMcpWriteResult> => {
    try {
      const { rootPath, configPath } = readArgs(args)
      return {
        ok: true,
        value: {
          configPath: unregisterSiteMcpServer(rootPath, configPath),
          targets: readSiteMcpTargets(rootPath)
        }
      }
    } catch (error) {
      return failure(error)
    }
  })
}
