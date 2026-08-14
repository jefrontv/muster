// Detects the ActiveCollab MCP server, reports which agents are wired to it, writes the ones the
// user asked for, and seeds the server's own credential file from the token Muster already holds.
//
// Seeding is the point of the whole feature: without it the human authenticates in Muster and then
// authenticates the agent's MCP separately, and the two can drift onto different instances or
// accounts. With it, the agent inherits exactly the connection the human is looking at.
//
// This module never installs anything. `install.sh` and pipx are the user's to run — we detect,
// report the exact command, and refuse to spawn a package manager behind their back.

import { join } from 'node:path'
import {
  ACTIVECOLLAB_MCP_AGENTS,
  ACTIVECOLLAB_MCP_BINARY_NAME,
  createDefaultActiveCollabMcpEnv,
  findActiveCollabMcpAgent,
  type ActiveCollabMcpEnv
} from './mcp-agents'
import { getActiveCollabCredential } from './credential-store'
import { isPlainJsonObject } from '../sites/mcp/site-mcp-jsonrpc'
import {
  ACTIVECOLLAB_MCP_INSTALL_COMMAND,
  type ActiveCollabMcpAgentId,
  type ActiveCollabMcpAgentWriteResult,
  type ActiveCollabMcpBinary,
  type ActiveCollabMcpInstallResult,
  type ActiveCollabMcpSeedResult,
  type ActiveCollabMcpStatus
} from '../../shared/activecollab-mcp-types'

export { ACTIVECOLLAB_MCP_INSTALL_COMMAND }

const MISSING_BINARY_HINT = `activecollab-mcp is not installed. Run: ${ACTIVECOLLAB_MCP_INSTALL_COMMAND}`

const NOTHING_TO_SEED_REASON =
  'ActiveCollab is not connected in Muster, so there is no token to share with the agent.'

const NOT_LINKED_REASON =
  'The MCP server has no credential file yet, so there is nothing to keep in step. Seed it once from this card.'

export function activeCollabMcpCredentialsPath(env: ActiveCollabMcpEnv): string {
  return join(env.homeDir, '.activecollab-mcp', 'credentials.json')
}

/**
 * pipx records the installed version in its own metadata file, so a version is one file read rather
 * than a subprocess. Absent or unparseable metadata simply means "version unknown".
 */
function readPipxVersion(env: ActiveCollabMcpEnv): string | null {
  const raw = env.fs.readText(
    join(env.homeDir, '.local', 'pipx', 'venvs', ACTIVECOLLAB_MCP_BINARY_NAME, 'pipx_metadata.json')
  )
  if (raw === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    const mainPackage = isPlainJsonObject(parsed) ? parsed.main_package : null
    const version = isPlainJsonObject(mainPackage) ? mainPackage.package_version : null
    return typeof version === 'string' && version.length > 0 ? version : null
  } catch {
    return null
  }
}

/**
 * PATH first, then the pipx default (`~/.local/bin`) — that directory is often missing from a GUI
 * app's inherited PATH even though the user's shell has it, which would otherwise report a
 * perfectly working install as absent.
 */
export function detectActiveCollabMcp(
  env: ActiveCollabMcpEnv = createDefaultActiveCollabMcpEnv()
): ActiveCollabMcpBinary {
  for (const directory of env.pathEntries) {
    for (const name of env.executableNames) {
      const candidate = join(directory, name)
      if (env.fs.isExecutableFile(candidate)) {
        return {
          found: true,
          path: candidate,
          version: readPipxVersion(env),
          source: 'path',
          installHint: ''
        }
      }
    }
  }

  const pipxPath = join(env.homeDir, '.local', 'bin', ACTIVECOLLAB_MCP_BINARY_NAME)
  if (env.fs.isExecutableFile(pipxPath)) {
    return {
      found: true,
      path: pipxPath,
      version: readPipxVersion(env),
      source: 'pipx',
      installHint: ''
    }
  }

  return { found: false, path: null, version: null, source: null, installHint: MISSING_BINARY_HINT }
}

export function getActiveCollabMcpStatus(
  env: ActiveCollabMcpEnv = createDefaultActiveCollabMcpEnv()
): ActiveCollabMcpStatus {
  const binary = detectActiveCollabMcp(env)
  const credentialsPath = activeCollabMcpCredentialsPath(env)
  return {
    binary,
    agents: ACTIVECOLLAB_MCP_AGENTS.map((agent) => ({
      id: agent.id,
      label: agent.label,
      configPath: agent.configPath(env),
      requiresRunningServer: agent.requiresRunningServer,
      ...agent.detect(env, binary.path)
    })),
    credentialsPath,
    credentialsSeeded: env.fs.exists(credentialsPath)
  }
}

/**
 * Writes config for each requested agent independently: one agent's unparseable config or missing
 * binary must not silently cancel the others, so failures are reported per agent instead of thrown.
 */
export function installActiveCollabMcpForAgents(
  agentIds: readonly ActiveCollabMcpAgentId[],
  env: ActiveCollabMcpEnv = createDefaultActiveCollabMcpEnv()
): ActiveCollabMcpInstallResult {
  const binaryPath = detectActiveCollabMcp(env).path
  const results: ActiveCollabMcpAgentWriteResult[] = agentIds.map((id) => {
    const agent = findActiveCollabMcpAgent(id)
    const configPath = agent.configPath(env)
    try {
      agent.install(env, binaryPath)
      return { id, configPath, ok: true }
    } catch (error) {
      return {
        id,
        configPath,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
  return { results, status: getActiveCollabMcpStatus(env) }
}

/**
 * The Python side stores the API root, not the instance root: `auth login` writes
 * `<instance>/api/v1/`, and only appends that suffix when the URL carries no path of its own.
 * Mirror both rules exactly or the seeded token addresses the wrong prefix and every call 404s.
 */
function toMcpBaseUrl(instanceUrl: string): string {
  const url = new URL(instanceUrl.endsWith('/') ? instanceUrl : `${instanceUrl}/`)
  if (url.pathname === '/') {
    url.pathname = '/api/v1/'
  }
  return url.toString()
}

/**
 * No Muster credential is a clean "nothing to seed", not an error: the install is still useful and
 * the user can authenticate the MCP by hand. A keychain refusal, by contrast, throws — the caller
 * turns that into a message worth showing.
 */
export function seedActiveCollabMcpCredentials(
  env: ActiveCollabMcpEnv = createDefaultActiveCollabMcpEnv()
): ActiveCollabMcpSeedResult {
  const credential = getActiveCollabCredential()
  if (credential === null) {
    return { seeded: false, reason: NOTHING_TO_SEED_REASON }
  }
  const target = activeCollabMcpCredentialsPath(env)
  const contents = {
    base_url: toMcpBaseUrl(credential.instanceUrl),
    api_key: credential.token,
    issued_at: new Date().toISOString(),
    issued_for: credential.userEmail
  }
  env.fs.writeSecretText(target, `${JSON.stringify(contents, null, 2)}\n`)
  return { seeded: true, path: target, issuedFor: credential.userEmail }
}

/**
 * Keeps an ALREADY-LINKED MCP credential file in step with the account Muster just connected to.
 *
 * Rewrites only a file that is already there, and never creates one. First-time minting is
 * `seedActiveCollabMcpCredentials`, which connect now calls so the Tasks login is the only
 * password the user types. This helper stays for callers that must not create the file.
 *
 * Drift is the half worth automating: reconnecting Muster to a different instance or account used
 * to leave the agent silently authenticated as the previous one, which is the exact failure this
 * whole module exists to prevent.
 */
export function resyncActiveCollabMcpCredentials(
  env: ActiveCollabMcpEnv = createDefaultActiveCollabMcpEnv()
): ActiveCollabMcpSeedResult {
  if (!env.fs.exists(activeCollabMcpCredentialsPath(env))) {
    return { seeded: false, reason: NOT_LINKED_REASON }
  }
  return seedActiveCollabMcpCredentials(env)
}

export type ActiveCollabMcpShareResult = {
  credentials: ActiveCollabMcpSeedResult
  /** Null when the binary is missing — we refuse to write a Claude entry that cannot spawn. */
  claude: ActiveCollabMcpAgentWriteResult | null
}

/**
 * What connect does: mint (or rewrite) the MCP credential from this login, then wire Claude Code
 * when `activecollab-mcp` is already on the machine.
 *
 * Claude is the only agent written unprompted. Codex and Cursor stay on the Settings card. A
 * missing binary is a skip, not an error. This still does not run pipx.
 */
export function shareActiveCollabLoginWithMcp(
  env: ActiveCollabMcpEnv = createDefaultActiveCollabMcpEnv()
): ActiveCollabMcpShareResult {
  const credentials = seedActiveCollabMcpCredentials(env)
  if (!credentials.seeded || !detectActiveCollabMcp(env).found) {
    return { credentials, claude: null }
  }
  const installed = installActiveCollabMcpForAgents(['claude-code'], env)
  return { credentials, claude: installed.results[0] ?? null }
}
