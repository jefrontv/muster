// Wire types for the built-in site MCP server surface.
//
// In shared/ rather than beside the handlers because the preload type surface is compiled into the
// browser project, and the handler module reaches into node:fs. Same precedent as
// site-stack-types.ts and site-bind-types.ts.

// env rides along because the entry launches the shim under ELECTRON_RUN_AS_NODE — a plain-Node
// relay that re-spawns the real server DETACHED, so Chromium can never seize the harness's tty.
export type SiteMcpCommand = { command: string; args: string[]; env: Record<string, string> }

export type SiteMcpToolInfo = { name: string; description: string }

export type SiteMcpTargetStatus = {
  label: string
  relativePath: string
  absolutePath: string
  exists: boolean
  registered: boolean
  /** True when the stored entry already points at this build; false means it needs a rewrite. */
  current: boolean
  /** Set when the file exists but could not be parsed, so the UI can explain rather than retry. */
  error?: string
}

export type SiteMcpStatus = {
  serverName: string
  command: SiteMcpCommand
  tools: SiteMcpToolInfo[]
  /** Empty when no project path was supplied — the tool list is still useful on its own. */
  targets: SiteMcpTargetStatus[]
  defaultConfigPath: string
}

export type SiteMcpWriteResult = {
  configPath: string
  targets: SiteMcpTargetStatus[]
}

// --- Global harness registration (Settings → Agent Capabilities install card) ---
//
// The ids are a const tuple rather than a bare union for the same reason as
// ACTIVECOLLAB_MCP_AGENT_IDS: the IPC boundary validates against the runtime array, so adding a
// harness cannot leave the validator behind.

export const SITE_MCP_HARNESS_IDS = ['claude-code', 'codex', 'cursor'] as const

export type SiteMcpHarnessId = (typeof SITE_MCP_HARNESS_IDS)[number]

export function isSiteMcpHarnessId(value: unknown): value is SiteMcpHarnessId {
  return typeof value === 'string' && (SITE_MCP_HARNESS_IDS as readonly string[]).includes(value)
}

export type SiteMcpHarnessStatus = {
  id: SiteMcpHarnessId
  label: string
  /** The user-global config file this harness reads, e.g. ~/.claude.json. */
  configPath: string
  /** The harness itself looks installed for this user, config entry or not. */
  present: boolean
  configured: boolean
  /** True when the stored entry already matches what Muster would write now. */
  current: boolean
  /** Set when the config exists but could not be read, so the UI explains rather than retries. */
  error?: string
}

export type SiteMcpGlobalStatus = {
  serverName: string
  command: SiteMcpCommand
  harnesses: SiteMcpHarnessStatus[]
}

export type SiteMcpGlobalInstallResult = {
  configPath: string
  status: SiteMcpGlobalStatus
}
