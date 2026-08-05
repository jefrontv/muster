// One adapter per coding agent Muster can wire the ActiveCollab MCP into.
//
// `active-collab-mcp/install.sh` writes NO agent configuration — it only prints instructions — so
// Muster writes each config itself. Every adapter therefore splices: read, replace exactly the
// `activecollab` key, write back. A user's other MCP servers are never ours to remove.
//
// The three agents disagree on two things that matter:
//   - Claude Code resolves `activecollab-mcp` from PATH; Codex does not, so it needs the absolute
//     path the pipx shim lives at.
//   - Cursor speaks Streamable HTTP, so its entry points at the daemon's loopback URL and stays
//     inert until that daemon is running. Nothing about it depends on the binary's location.

import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  ACTIVECOLLAB_MCP_HTTP_URL,
  ACTIVECOLLAB_MCP_SERVER_KEY,
  type ActiveCollabMcpAgentId
} from '../../shared/activecollab-mcp-types'
import { escapeTomlString } from '../codex/config-toml-trust'
import {
  createNodeActiveCollabMcpFs,
  readJsonMcpServer,
  readTomlTable,
  spliceJsonMcpServer,
  spliceTomlTable,
  tomlLineValue,
  type ActiveCollabMcpFs,
  type JsonObject
} from './mcp-config-io'

export const ACTIVECOLLAB_MCP_BINARY_NAME = 'activecollab-mcp'

const CODEX_TABLE_HEADER = `[mcp_servers.${ACTIVECOLLAB_MCP_SERVER_KEY}]`

const MISSING_BINARY_MESSAGE =
  'The activecollab-mcp binary was not found, so this agent would be pointed at nothing.'

/**
 * Everything the install touches that a test must be able to redirect: the home directory the
 * config paths hang off, the PATH entries the binary search walks, and the fs itself.
 */
export type ActiveCollabMcpEnv = {
  homeDir: string
  /** Already split, in search order. */
  pathEntries: readonly string[]
  /** Platform-appropriate basenames for the pipx console script. */
  executableNames: readonly string[]
  fs: ActiveCollabMcpFs
}

export function createDefaultActiveCollabMcpEnv(): ActiveCollabMcpEnv {
  return {
    homeDir: homedir(),
    pathEntries: (process.env.PATH ?? '').split(delimiter).filter((entry) => entry.length > 0),
    executableNames:
      process.platform === 'win32'
        ? [
            `${ACTIVECOLLAB_MCP_BINARY_NAME}.exe`,
            `${ACTIVECOLLAB_MCP_BINARY_NAME}.cmd`,
            ACTIVECOLLAB_MCP_BINARY_NAME
          ]
        : [ACTIVECOLLAB_MCP_BINARY_NAME],
    fs: createNodeActiveCollabMcpFs()
  }
}

export type ActiveCollabMcpAgentDetection = {
  present: boolean
  configured: boolean
  current: boolean
  error?: string
}

export type ActiveCollabMcpAgentAdapter = {
  id: ActiveCollabMcpAgentId
  label: string
  requiresRunningServer: boolean
  configPath: (env: ActiveCollabMcpEnv) => string
  /** `binaryPath` is null when the binary is missing; `current` is then false, never a throw. */
  detect: (env: ActiveCollabMcpEnv, binaryPath: string | null) => ActiveCollabMcpAgentDetection
  install: (env: ActiveCollabMcpEnv, binaryPath: string | null) => void
  uninstall: (env: ActiveCollabMcpEnv) => void
}

function detectJsonAgent(
  env: ActiveCollabMcpEnv,
  configPath: string,
  presencePaths: readonly string[],
  expected: JsonObject
): ActiveCollabMcpAgentDetection {
  // Presence means the agent itself looks installed for this user, entry or not.
  const present = presencePaths.some((candidate) => env.fs.exists(candidate))
  try {
    const entry = readJsonMcpServer(env.fs, configPath, ACTIVECOLLAB_MCP_SERVER_KEY)
    return {
      configured: entry !== null,
      // Why: compare the serialised forms so a reordered or partially hand-edited entry reads as
      // stale and gets rewritten, rather than silently passing a shallow key check.
      current: entry !== null && JSON.stringify(entry) === JSON.stringify(expected),
      present
    }
  } catch (error) {
    return {
      present,
      configured: false,
      current: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

const claudeCodeAgent: ActiveCollabMcpAgentAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  requiresRunningServer: false,
  configPath: (env) => join(env.homeDir, '.claude.json'),
  detect: (env) =>
    detectJsonAgent(
      env,
      join(env.homeDir, '.claude.json'),
      [join(env.homeDir, '.claude.json'), join(env.homeDir, '.claude')],
      { type: 'stdio', command: ACTIVECOLLAB_MCP_BINARY_NAME, args: ['--stdio'], env: {} }
    ),
  install: (env, binaryPath) => {
    // Why: the entry names the bare binary, but writing it while nothing is installed would hand
    // Claude Code a server that fails to spawn on every session start.
    if (binaryPath === null) {
      throw new Error(MISSING_BINARY_MESSAGE)
    }
    spliceJsonMcpServer(env.fs, join(env.homeDir, '.claude.json'), ACTIVECOLLAB_MCP_SERVER_KEY, {
      type: 'stdio',
      command: ACTIVECOLLAB_MCP_BINARY_NAME,
      args: ['--stdio'],
      env: {}
    })
  },
  uninstall: (env) => {
    spliceJsonMcpServer(
      env.fs,
      join(env.homeDir, '.claude.json'),
      ACTIVECOLLAB_MCP_SERVER_KEY,
      null
    )
  }
}

const codexAgent: ActiveCollabMcpAgentAdapter = {
  id: 'codex',
  label: 'Codex',
  requiresRunningServer: false,
  configPath: (env) => join(env.homeDir, '.codex', 'config.toml'),
  detect: (env, binaryPath) => {
    const configPath = join(env.homeDir, '.codex', 'config.toml')
    const block = readTomlTable(env.fs, configPath, CODEX_TABLE_HEADER)
    return {
      present: env.fs.exists(join(env.homeDir, '.codex')),
      configured: block !== null,
      current:
        block !== null &&
        binaryPath !== null &&
        tomlLineValue(block, 'command') === `"${escapeTomlString(binaryPath)}"` &&
        tomlLineValue(block, 'args') === '["--stdio"]'
    }
  },
  install: (env, binaryPath) => {
    // Why: Codex does not search PATH for MCP commands, so a bare name silently never starts.
    if (binaryPath === null) {
      throw new Error(MISSING_BINARY_MESSAGE)
    }
    spliceTomlTable(env.fs, join(env.homeDir, '.codex', 'config.toml'), CODEX_TABLE_HEADER, [
      `command = "${escapeTomlString(binaryPath)}"`,
      'args = ["--stdio"]'
    ])
  },
  uninstall: (env) => {
    spliceTomlTable(env.fs, join(env.homeDir, '.codex', 'config.toml'), CODEX_TABLE_HEADER, null)
  }
}

const cursorAgent: ActiveCollabMcpAgentAdapter = {
  id: 'cursor',
  label: 'Cursor',
  requiresRunningServer: true,
  configPath: (env) => join(env.homeDir, '.cursor', 'mcp.json'),
  detect: (env) =>
    detectJsonAgent(env, join(env.homeDir, '.cursor', 'mcp.json'), [join(env.homeDir, '.cursor')], {
      url: ACTIVECOLLAB_MCP_HTTP_URL
    }),
  // Why: HTTP transport, so the binary's whereabouts are irrelevant — Cursor can be wired up before
  // anything is installed locally and will connect once the daemon is listening.
  install: (env) => {
    spliceJsonMcpServer(
      env.fs,
      join(env.homeDir, '.cursor', 'mcp.json'),
      ACTIVECOLLAB_MCP_SERVER_KEY,
      { url: ACTIVECOLLAB_MCP_HTTP_URL }
    )
  },
  uninstall: (env) => {
    spliceJsonMcpServer(
      env.fs,
      join(env.homeDir, '.cursor', 'mcp.json'),
      ACTIVECOLLAB_MCP_SERVER_KEY,
      null
    )
  }
}

export const ACTIVECOLLAB_MCP_AGENTS: readonly ActiveCollabMcpAgentAdapter[] = [
  claudeCodeAgent,
  codexAgent,
  cursorAgent
]

export function findActiveCollabMcpAgent(id: ActiveCollabMcpAgentId): ActiveCollabMcpAgentAdapter {
  const agent = ACTIVECOLLAB_MCP_AGENTS.find((candidate) => candidate.id === id)
  if (!agent) {
    throw new Error(`Unknown MCP agent id: ${id}.`)
  }
  return agent
}
