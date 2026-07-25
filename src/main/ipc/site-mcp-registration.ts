// Reads and rewrites the `muster-sites` entry in an agent's MCP config.
//
// Config discovery reuses MCP_CONFIG_CANDIDATES (src/shared/mcp-config.ts) so the Sites surface and
// the Settings MCP inspector always agree on which files count. Writes are surgical: the file is
// parsed, one key under the candidate's serversPath is added or removed, and everything else is
// written back untouched. An unparseable config is refused rather than replaced — it is the user's
// file and it may hold every other MCP server they depend on.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { app } from 'electron'
import {
  MCP_CONFIG_CANDIDATES,
  MCP_STARTER_CONFIG,
  type McpConfigCandidate
} from '../../shared/mcp-config'
import { SITE_MCP_CLI_FLAG } from '../sites/mcp/site-mcp-entry'
import { SITE_MCP_SERVER_NAME } from '../sites/mcp/site-mcp-tools'

import type { SiteMcpCommand, SiteMcpTargetStatus } from '../../shared/site-mcp-types'

export const DEFAULT_SITE_MCP_CONFIG_PATH = '.mcp.json'

export type { SiteMcpCommand, SiteMcpTargetStatus }

/**
 * The Electron binary itself, not the `muster` shell shim: the shim runs the CLI under
 * ELECTRON_RUN_AS_NODE, which has no safeStorage, and the MCP server must be able to decrypt a
 * site's SSH password to run a deploy. In development the app directory has to be passed too,
 * exactly as `electron .` does.
 */
export function resolveSiteMcpCommand(): SiteMcpCommand {
  return app.isPackaged
    ? { command: process.execPath, args: [SITE_MCP_CLI_FLAG] }
    : { command: process.execPath, args: [app.getAppPath(), SITE_MCP_CLI_FLAG] }
}

export function findSiteMcpCandidate(relativePath: string): McpConfigCandidate {
  const candidate = MCP_CONFIG_CANDIDATES.find((entry) => entry.relativePath === relativePath)
  if (!candidate) {
    throw new Error(`Unsupported MCP config path: ${relativePath}`)
  }
  return candidate
}

function requireRoot(rootPath: unknown): string {
  if (typeof rootPath !== 'string' || rootPath.length === 0 || !isAbsolute(rootPath)) {
    throw new Error('An absolute project path is required.')
  }
  return rootPath
}

function readServers(
  absolutePath: string,
  serversPath: readonly string[]
): { document: Record<string, unknown>; servers: Record<string, unknown> } {
  const raw = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : MCP_STARTER_CONFIG
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${absolutePath} is not a JSON object.`)
  }
  const document = parsed as Record<string, unknown>
  let cursor = document
  for (const segment of serversPath) {
    const next = cursor[segment]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      const created: Record<string, unknown> = {}
      cursor[segment] = created
      cursor = created
      continue
    }
    cursor = next as Record<string, unknown>
  }
  return { document, servers: cursor }
}

export function readSiteMcpTargets(rootPath: string): SiteMcpTargetStatus[] {
  const root = requireRoot(rootPath)
  const expected = resolveSiteMcpCommand()
  return MCP_CONFIG_CANDIDATES.map((candidate) => {
    const absolutePath = join(root, candidate.relativePath)
    const base = {
      label: candidate.label,
      relativePath: candidate.relativePath,
      absolutePath,
      exists: existsSync(absolutePath)
    }
    if (!base.exists) {
      return { ...base, registered: false, current: false }
    }
    try {
      const { servers } = readServers(absolutePath, candidate.serversPath)
      const entry = servers[SITE_MCP_SERVER_NAME]
      if (typeof entry !== 'object' || entry === null) {
        return { ...base, registered: false, current: false }
      }
      const record = entry as Record<string, unknown>
      const args = Array.isArray(record.args) ? record.args : []
      return {
        ...base,
        registered: true,
        current:
          record.command === expected.command &&
          args.length === expected.args.length &&
          expected.args.every((value, index) => args[index] === value)
      }
    } catch (error) {
      return {
        ...base,
        registered: false,
        current: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}

/** Adds or replaces the entry. Re-registering is how a moved or upgraded app repairs a stale path. */
export function registerSiteMcpServer(rootPath: string, relativePath: string): string {
  const root = requireRoot(rootPath)
  const candidate = findSiteMcpCandidate(relativePath)
  const absolutePath = join(root, candidate.relativePath)
  const { document, servers } = readServers(absolutePath, candidate.serversPath)
  servers[SITE_MCP_SERVER_NAME] = resolveSiteMcpCommand()
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return absolutePath
}

export function unregisterSiteMcpServer(rootPath: string, relativePath: string): string {
  const root = requireRoot(rootPath)
  const candidate = findSiteMcpCandidate(relativePath)
  const absolutePath = join(root, candidate.relativePath)
  if (!existsSync(absolutePath)) {
    return absolutePath
  }
  const { document, servers } = readServers(absolutePath, candidate.serversPath)
  if (!Object.hasOwn(servers, SITE_MCP_SERVER_NAME)) {
    return absolutePath
  }
  delete servers[SITE_MCP_SERVER_NAME]
  writeFileSync(absolutePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return absolutePath
}
