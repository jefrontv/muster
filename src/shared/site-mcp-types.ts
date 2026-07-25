// Wire types for the built-in site MCP server surface.
//
// In shared/ rather than beside the handlers because the preload type surface is compiled into the
// browser project, and the handler module reaches into node:fs. Same precedent as
// site-stack-types.ts and site-bind-types.ts.

export type SiteMcpCommand = { command: string; args: string[] }

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
