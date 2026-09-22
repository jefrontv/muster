// Reads and writes one catalog entry's MCP registration in each harness the entry names.
//
// This is the ActiveCollab install's adapter shape with the server hardcoding taken out, and it
// reuses activecollab/mcp-config-io.ts rather than growing a third config editor — the same choice
// site-mcp-global-registration.ts already made, and for the same reason: those helpers enforce the
// invariant that matters, which is that an unparseable config is refused and never replaced.
//
// The one behaviour worth stating plainly: Claude Code and Cursor resolve a stdio command through
// PATH, Codex does not. Writing a bare binary name into Codex produces an entry that silently never
// starts, so Codex gets the resolved absolute path or nothing at all. OMP and PI take the absolute
// path too, matching what is already in their configs.

import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createNodeActiveCollabMcpFs,
  readJsonMcpServer,
  readTomlTable,
  spliceJsonMcpServer,
  spliceTomlTable,
  tomlLineValue,
  type ActiveCollabMcpFs,
  type JsonObject
} from '../activecollab/mcp-config-io'
import { escapeTomlString } from '../codex/config-toml-trust'
import type {
  ExtensionHarnessId,
  ExtensionMcpServerSpec,
  ExtensionMcpTransport
} from '../../shared/extension-catalog-types'
import type { ExtensionHarnessState } from '../../shared/extension-state-types'

export type ExtensionMcpEnv = {
  homeDir: string
  fs: ActiveCollabMcpFs
}

export function createDefaultExtensionMcpEnv(): ExtensionMcpEnv {
  return { homeDir: homedir(), fs: createNodeActiveCollabMcpFs() }
}

export const MISSING_BINARY_MESSAGE =
  'That server’s program is not installed yet, so this entry would point at nothing.'

type HarnessPaths = {
  label: string
  configPath: (env: ExtensionMcpEnv) => string
  presencePaths: (env: ExtensionMcpEnv) => string[]
  format: 'json' | 'toml'
  /** Codex cannot search PATH, so a bare command name is useless to it. */
  needsAbsolutePath: boolean
  /** Extra TOML lines this harness expects, written and compared like the rest of the table. */
  extraTomlLines?: string[]
}

const HARNESSES: Record<ExtensionHarnessId, HarnessPaths> = {
  'claude-code': {
    label: 'Claude Code',
    configPath: (env) => join(env.homeDir, '.claude.json'),
    presencePaths: (env) => [join(env.homeDir, '.claude.json'), join(env.homeDir, '.claude')],
    format: 'json',
    needsAbsolutePath: false
  },
  codex: {
    label: 'Codex',
    configPath: (env) => join(env.homeDir, '.codex', 'config.toml'),
    presencePaths: (env) => [join(env.homeDir, '.codex')],
    format: 'toml',
    needsAbsolutePath: true
  },
  cursor: {
    label: 'Cursor',
    configPath: (env) => join(env.homeDir, '.cursor', 'mcp.json'),
    presencePaths: (env) => [join(env.homeDir, '.cursor')],
    format: 'json',
    needsAbsolutePath: false
  },
  // omp and pi are the same family and take the same file, one directory apart. Both get absolute
  // paths: every entry already in those configs on a real machine is absolute, so matching that is
  // both the safer read and the one that does not depend on which shell launched the agent.
  // Grok's own `mcp add` writes command, args and `enabled` into ~/.grok/config.toml, so Muster
  // writes the same three. Disabling a server in Grok therefore reads here as drift, which is the
  // honest answer: the stored entry is no longer the one Muster would write.
  grok: {
    label: 'Grok',
    configPath: (env) => join(env.homeDir, '.grok', 'config.toml'),
    presencePaths: (env) => [join(env.homeDir, '.grok')],
    format: 'toml',
    needsAbsolutePath: true,
    extraTomlLines: ['enabled = true']
  },
  omp: {
    label: 'OMP',
    configPath: (env) => join(env.homeDir, '.omp', 'agent', 'mcp.json'),
    presencePaths: (env) => [join(env.homeDir, '.omp')],
    format: 'json',
    needsAbsolutePath: true
  },
  pi: {
    label: 'PI',
    configPath: (env) => join(env.homeDir, '.pi', 'agent', 'mcp.json'),
    presencePaths: (env) => [join(env.homeDir, '.pi')],
    format: 'json',
    needsAbsolutePath: true
  }
}

/** Null when a stdio transport needs a binary that is not installed. */
function jsonEntryFor(
  transport: ExtensionMcpTransport,
  harness: HarnessPaths,
  binaryPath: string | null
): JsonObject | null {
  if (transport.kind === 'http') {
    return { url: transport.url }
  }
  // Why every harness refuses, not just Codex: an entry naming a binary that is not installed makes
  // the harness fail to spawn a server on every session start, which is worse than no entry at all.
  if (binaryPath === null) {
    return null
  }
  return {
    type: 'stdio',
    command: harness.needsAbsolutePath ? binaryPath : transport.binary,
    args: transport.args,
    env: transport.env
  }
}

function tomlBodyFor(
  transport: ExtensionMcpTransport,
  binaryPath: string | null,
  harness: HarnessPaths
): string[] | null {
  const extra = harness.extraTomlLines ?? []
  if (transport.kind === 'http') {
    return [`url = "${escapeTomlString(transport.url)}"`, ...extra]
  }
  if (binaryPath === null) {
    return null
  }
  const args = transport.args.map((value) => `"${escapeTomlString(value)}"`).join(', ')
  const env = Object.entries(transport.env)
    .map(([key, value]) => `${key} = "${escapeTomlString(value)}"`)
    .join(', ')
  return [
    `command = "${escapeTomlString(binaryPath)}"`,
    `args = [${args}]`,
    ...(env.length > 0 ? [`env = { ${env} }`] : []),
    ...extra
  ]
}

function codexHeader(key: string): string {
  return `[mcp_servers.${key}]`
}

function detectJson(
  env: ExtensionMcpEnv,
  harness: HarnessPaths,
  key: string,
  expected: JsonObject | null
): Omit<ExtensionHarnessState, 'id' | 'label' | 'configPath'> {
  const present = harness.presencePaths(env).some((candidate) => env.fs.exists(candidate))
  try {
    const entry = readJsonMcpServer(env.fs, harness.configPath(env), key)
    return {
      present,
      configured: entry !== null,
      // Why compare serialised forms: a reordered or hand-edited entry should read as stale and get
      // rewritten, rather than passing a shallow key check and staying subtly wrong.
      current: entry !== null && expected !== null && JSON.stringify(entry) === JSON.stringify(expected)
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

/** Key names in a written table, so an entry with a key too MANY reads as drift. */
function tomlBlockKeys(block: string): string[] {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('[') && !line.startsWith('#'))
    .map((line) => line.split('=')[0]?.trim() ?? '')
    .filter((name) => name.length > 0)
}

function detectToml(
  env: ExtensionMcpEnv,
  harness: HarnessPaths,
  key: string,
  expected: string[] | null
): Omit<ExtensionHarnessState, 'id' | 'label' | 'configPath'> {
  const present = harness.presencePaths(env).some((candidate) => env.fs.exists(candidate))
  try {
    const block = readTomlTable(env.fs, harness.configPath(env), codexHeader(key))
    // Why the key sets are compared as well as the values: checking only that every EXPECTED line
    // is present cannot see a line the stored table has and the expected body does not. Clearing an
    // API key removes the whole `env` line, so a one-directional check called that "current" and
    // left the old value in Codex's config for good.
    const expectedNames = expected?.map((line) => line.split(' = ')[0] ?? '') ?? []
    const matches =
      block !== null &&
      expected !== null &&
      tomlBlockKeys(block).sort().join(',') === [...expectedNames].sort().join(',') &&
      expected.every((line) => {
        const [name] = line.split(' = ')
        return `${name} = ${tomlLineValue(block, name) ?? ''}` === line
      })
    return { present, configured: block !== null, current: matches }
  } catch (error) {
    return {
      present,
      configured: false,
      current: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function readExtensionMcpHarnessStates(
  server: ExtensionMcpServerSpec,
  binaryPath: string | null,
  env: ExtensionMcpEnv = createDefaultExtensionMcpEnv()
): ExtensionHarnessState[] {
  return server.harnesses.map(({ id, transport }) => {
    const harness = HARNESSES[id]
    const detection =
      harness.format === 'json'
        ? detectJson(env, harness, server.key, jsonEntryFor(transport, harness, binaryPath))
        : detectToml(env, harness, server.key, tomlBodyFor(transport, binaryPath, harness))
    return { id, label: harness.label, configPath: harness.configPath(env), ...detection }
  })
}

/** Adds or replaces this entry's key. Re-installing is how a moved or upgraded binary is repaired. */
export function installExtensionMcpHarness(
  server: ExtensionMcpServerSpec,
  harnessId: ExtensionHarnessId,
  binaryPath: string | null,
  env: ExtensionMcpEnv = createDefaultExtensionMcpEnv()
): string {
  const target = server.harnesses.find((candidate) => candidate.id === harnessId)
  if (!target) {
    throw new Error(`This extension does not support ${harnessId}.`)
  }
  const harness = HARNESSES[harnessId]
  const configPath = harness.configPath(env)
  if (harness.format === 'json') {
    const entry = jsonEntryFor(target.transport, harness, binaryPath)
    if (entry === null) {
      throw new Error(MISSING_BINARY_MESSAGE)
    }
    spliceJsonMcpServer(env.fs, configPath, server.key, entry)
    return configPath
  }
  const body = tomlBodyFor(target.transport, binaryPath, harness)
  if (body === null) {
    throw new Error(MISSING_BINARY_MESSAGE)
  }
  spliceTomlTable(env.fs, configPath, codexHeader(server.key), body)
  return configPath
}

export function uninstallExtensionMcpHarness(
  server: ExtensionMcpServerSpec,
  harnessId: ExtensionHarnessId,
  env: ExtensionMcpEnv = createDefaultExtensionMcpEnv()
): string {
  const harness = HARNESSES[harnessId]
  const configPath = harness.configPath(env)
  if (harness.format === 'json') {
    spliceJsonMcpServer(env.fs, configPath, server.key, null)
  } else {
    spliceTomlTable(env.fs, configPath, codexHeader(server.key), null)
  }
  return configPath
}
