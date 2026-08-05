// Global (per-user) `muster-sites` registration for coding harnesses: Claude Code, Codex, Cursor.
//
// Complements site-mcp-registration.ts, which handles per-PROJECT configs (.mcp.json and friends).
// Because the site MCP server resolves its site from the CWD the harness spawns it in, one global
// entry serves every project — the same model ocsites-mcp uses.
//
// The file editing deliberately reuses the ActiveCollab MCP install's parse/splice helpers
// (activecollab/mcp-config-io.ts) rather than growing a third config-editing implementation: those
// helpers are already parameterised by target path, server key, and TOML table header, and they
// enforce the one invariant that matters here — an unparseable config is refused, never replaced.
//
// Unlike the ActiveCollab install there is no binary to detect: the server IS this app, so the
// expected command comes from the caller (resolveSiteMcpCommand) and staleness is simply "the
// stored command differs from what this build would write now".

import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createNodeActiveCollabMcpFs,
  readJsonMcpServer,
  readTomlTable,
  spliceJsonMcpServer,
  spliceTomlTable,
  tomlLineValue,
  type ActiveCollabMcpFs
} from '../activecollab/mcp-config-io'
import { escapeTomlString } from '../codex/config-toml-trust'
import { SITE_MCP_SERVER_NAME } from '../sites/mcp/site-mcp-tools'
import type {
  SiteMcpCommand,
  SiteMcpHarnessId,
  SiteMcpHarnessStatus
} from '../../shared/site-mcp-types'

/** Injectable so tests can aim every read and write at a temp home instead of the real one. */
export type SiteMcpGlobalEnv = {
  homeDir: string
  fs: ActiveCollabMcpFs
}

export function createDefaultSiteMcpGlobalEnv(): SiteMcpGlobalEnv {
  return { homeDir: homedir(), fs: createNodeActiveCollabMcpFs() }
}

const CODEX_TABLE_HEADER = `[mcp_servers.${SITE_MCP_SERVER_NAME}]`

function codexTableBody(command: SiteMcpCommand): string[] {
  const envPairs = Object.entries(command.env)
    .map(([key, value]) => `${key} = "${escapeTomlString(value)}"`)
    .join(', ')
  return [
    `command = "${escapeTomlString(command.command)}"`,
    `args = [${command.args.map((value) => `"${escapeTomlString(value)}"`).join(', ')}]`,
    `env = { ${envPairs} }`
  ]
}

type SiteMcpHarnessAdapter = {
  id: SiteMcpHarnessId
  label: string
  configPath: (env: SiteMcpGlobalEnv) => string
  detect: (
    env: SiteMcpGlobalEnv,
    command: SiteMcpCommand
  ) => Pick<SiteMcpHarnessStatus, 'present' | 'configured' | 'current' | 'error'>
  install: (env: SiteMcpGlobalEnv, command: SiteMcpCommand) => void
}

function detectJsonHarness(
  env: SiteMcpGlobalEnv,
  configPath: string,
  presencePaths: readonly string[],
  command: SiteMcpCommand
): Pick<SiteMcpHarnessStatus, 'present' | 'configured' | 'current' | 'error'> {
  // Presence means the harness itself looks installed for this user, entry or not.
  const present = presencePaths.some((candidate) => env.fs.exists(candidate))
  try {
    const entry = readJsonMcpServer(env.fs, configPath, SITE_MCP_SERVER_NAME)
    return {
      present,
      configured: entry !== null,
      // Why: compare the serialised forms so a reordered or partially hand-edited entry reads as
      // stale and gets rewritten, rather than silently passing a shallow key check.
      current:
        entry !== null &&
        JSON.stringify(entry) ===
          JSON.stringify({ command: command.command, args: command.args, env: command.env })
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

const claudeCodeHarness: SiteMcpHarnessAdapter = {
  id: 'claude-code',
  label: 'Claude Code',
  configPath: (env) => join(env.homeDir, '.claude.json'),
  detect: (env, command) =>
    detectJsonHarness(
      env,
      join(env.homeDir, '.claude.json'),
      [join(env.homeDir, '.claude.json'), join(env.homeDir, '.claude')],
      command
    ),
  install: (env, command) => {
    spliceJsonMcpServer(env.fs, join(env.homeDir, '.claude.json'), SITE_MCP_SERVER_NAME, {
      command: command.command,
      args: command.args,
      env: command.env
    })
  }
}

const codexHarness: SiteMcpHarnessAdapter = {
  id: 'codex',
  label: 'Codex',
  configPath: (env) => join(env.homeDir, '.codex', 'config.toml'),
  detect: (env, command) => {
    const configPath = join(env.homeDir, '.codex', 'config.toml')
    const block = readTomlTable(env.fs, configPath, CODEX_TABLE_HEADER)
    const [expectedCommand, expectedArgs] = codexTableBody(command)
    return {
      present: env.fs.exists(join(env.homeDir, '.codex')),
      configured: block !== null,
      current:
        block !== null &&
        `command = ${tomlLineValue(block, 'command') ?? ''}` === expectedCommand &&
        `args = ${tomlLineValue(block, 'args') ?? ''}` === expectedArgs
    }
  },
  install: (env, command) => {
    spliceTomlTable(
      env.fs,
      join(env.homeDir, '.codex', 'config.toml'),
      CODEX_TABLE_HEADER,
      codexTableBody(command)
    )
  }
}

const cursorHarness: SiteMcpHarnessAdapter = {
  id: 'cursor',
  label: 'Cursor',
  configPath: (env) => join(env.homeDir, '.cursor', 'mcp.json'),
  detect: (env, command) =>
    detectJsonHarness(
      env,
      join(env.homeDir, '.cursor', 'mcp.json'),
      [join(env.homeDir, '.cursor')],
      command
    ),
  install: (env, command) => {
    spliceJsonMcpServer(env.fs, join(env.homeDir, '.cursor', 'mcp.json'), SITE_MCP_SERVER_NAME, {
      command: command.command,
      args: command.args,
      env: command.env
    })
  }
}

export const SITE_MCP_HARNESSES: readonly SiteMcpHarnessAdapter[] = [
  claudeCodeHarness,
  codexHarness,
  cursorHarness
]

export function readSiteMcpHarnessStatuses(
  command: SiteMcpCommand,
  env: SiteMcpGlobalEnv = createDefaultSiteMcpGlobalEnv()
): SiteMcpHarnessStatus[] {
  return SITE_MCP_HARNESSES.map((harness) => ({
    id: harness.id,
    label: harness.label,
    configPath: harness.configPath(env),
    ...harness.detect(env, command)
  }))
}

/** Adds or replaces the entry. Re-installing is how a moved or upgraded app repairs a stale path. */
export function installSiteMcpHarness(
  id: SiteMcpHarnessId,
  command: SiteMcpCommand,
  env: SiteMcpGlobalEnv = createDefaultSiteMcpGlobalEnv()
): string {
  const harness = SITE_MCP_HARNESSES.find((candidate) => candidate.id === id)
  if (!harness) {
    throw new Error(`Unknown MCP harness id: ${id}.`)
  }
  harness.install(env, command)
  return harness.configPath(env)
}
