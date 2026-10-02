// Wire types for the ActiveCollab MCP server's status and credential file.
//
// In shared/ rather than beside the handlers because the preload type surface is compiled into the
// browser project while the implementation reaches into node:fs — same split as site-mcp-types.ts.
//
// Which agents have the server is the Extension Hub's inventory, not this module's.

import type { SiteResult } from './site-types'

/** The documented install route. Published on PyPI — no Bitbucket SSH key required. */
export const ACTIVECOLLAB_MCP_INSTALL_COMMAND = 'pipx install activecollab-mcp'

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

export type ActiveCollabMcpStatus = {
  binary: ActiveCollabMcpBinary
  credentialsPath: string
  credentialsSeeded: boolean
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
  seedCredentials: () => Promise<SiteResult<ActiveCollabMcpSeedResult>>
}
