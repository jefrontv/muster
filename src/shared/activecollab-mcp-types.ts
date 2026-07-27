// Wire types for the one-click "install the ActiveCollab MCP into my agents" flow.
//
// In shared/ rather than beside the handlers because the preload type surface is compiled into the
// browser project while the implementation reaches into node:fs — same split as site-mcp-types.ts.
//
// The agent ids are a const tuple rather than a bare union: the IPC boundary validates against the
// runtime array, so adding an agent cannot leave the validator behind.

import type { SiteResult } from './site-types'

/** The key Muster owns inside every agent config. Nothing else under mcpServers is ours to touch. */
export const ACTIVECOLLAB_MCP_SERVER_KEY = 'activecollab'

/** The daemon's loopback endpoint. HTTP clients hold an inert entry until it is running. */
export const ACTIVECOLLAB_MCP_HTTP_URL = 'http://127.0.0.1:8787/mcp'

export const ACTIVECOLLAB_MCP_AGENT_IDS = ['claude-code', 'codex', 'cursor'] as const

export type ActiveCollabMcpAgentId = (typeof ACTIVECOLLAB_MCP_AGENT_IDS)[number]

export function isActiveCollabMcpAgentId(value: unknown): value is ActiveCollabMcpAgentId {
  return (
    typeof value === 'string' && (ACTIVECOLLAB_MCP_AGENT_IDS as readonly string[]).includes(value)
  )
}

export type ActiveCollabMcpBinarySource = 'path' | 'pipx'

export type ActiveCollabMcpBinary = {
  found: boolean
  /** Absolute path, so Codex — which does not search PATH — can be configured. */
  path: string | null
  /** From pipx metadata on disk; null when the binary came from somewhere else. */
  version: string | null
  source: ActiveCollabMcpBinarySource | null
  /** Empty when found. Otherwise the exact command the user should run. */
  installHint: string
}

export type ActiveCollabMcpAgentStatus = {
  id: ActiveCollabMcpAgentId
  label: string
  configPath: string
  /** The agent itself looks installed for this user, config entry or not. */
  present: boolean
  configured: boolean
  /** True when the stored entry already matches what Muster would write now. */
  current: boolean
  /** Cursor speaks HTTP, so its entry does nothing until the MCP daemon is running. */
  requiresRunningServer: boolean
  /** Set when the config exists but could not be read, so the UI explains rather than retries. */
  error?: string
}

export type ActiveCollabMcpStatus = {
  binary: ActiveCollabMcpBinary
  agents: ActiveCollabMcpAgentStatus[]
  credentialsPath: string
  credentialsSeeded: boolean
}

/** One entry per requested agent, so a partial failure is visible instead of aborting the batch. */
export type ActiveCollabMcpAgentWriteResult = {
  id: ActiveCollabMcpAgentId
  configPath: string
  ok: boolean
  error?: string
}

export type ActiveCollabMcpInstallResult = {
  results: ActiveCollabMcpAgentWriteResult[]
  status: ActiveCollabMcpStatus
}

/**
 * `seeded: false` is a normal outcome, not a failure: with no ActiveCollab credential in Muster
 * there is simply nothing to hand the agent, and the user can still authenticate the MCP by hand.
 */
export type ActiveCollabMcpSeedResult =
  | { seeded: true; path: string; issuedFor: string }
  | { seeded: false; reason: string }

export type ActiveCollabMcpApi = {
  status: () => Promise<SiteResult<ActiveCollabMcpStatus>>
  install: (args: {
    agentIds: ActiveCollabMcpAgentId[]
  }) => Promise<SiteResult<ActiveCollabMcpInstallResult>>
  seedCredentials: () => Promise<SiteResult<ActiveCollabMcpSeedResult>>
}
