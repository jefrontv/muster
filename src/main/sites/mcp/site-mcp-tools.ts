// The Muster site tool surface, transport-agnostic.
//
// One flat table assembled from the per-domain groups, plus the dispatcher. Nothing here knows
// about stdio, JSON-RPC or Electron: the table is a pure function of SiteMcpContext, so the same
// definitions can be served over any transport and exercised in a unit test against a fake Store.
//
// Tool names are ocsites' names, unchanged, so agent prompts written against ocsites-mcp keep
// working after the Python daemon is decommissioned.

import { SiteMcpToolError } from './site-mcp-arguments'
import { SITE_MCP_CONFIG_TOOLS } from './site-mcp-config-tools'
import type { SiteMcpContext, SiteMcpJsonSchema, SiteMcpTool } from './site-mcp-context'
import { SITE_MCP_CUSTOM_STEP_TOOLS } from './site-mcp-custom-step-tools'
import { SITE_MCP_STEP_LIBRARY_TOOLS } from './site-mcp-step-library-tools'
import { SITE_MCP_DISCOVERY_TOOLS } from './site-mcp-discovery-tools'
import { SITE_MCP_ENV_TOOLS } from './site-mcp-env-tools'
import { SITE_MCP_JOB_TOOLS } from './site-mcp-job-tools'
import { SITE_MCP_RUN_TOOLS } from './site-mcp-run-tools'
import { SITE_MCP_SSH_TOOLS } from './site-mcp-ssh-tools'

export const SITE_MCP_SERVER_NAME = 'muster-sites'

export const SITE_MCP_TOOLS: readonly SiteMcpTool[] = [
  ...SITE_MCP_DISCOVERY_TOOLS,
  ...SITE_MCP_CONFIG_TOOLS,
  ...SITE_MCP_CUSTOM_STEP_TOOLS,
  ...SITE_MCP_STEP_LIBRARY_TOOLS,
  ...SITE_MCP_ENV_TOOLS,
  ...SITE_MCP_RUN_TOOLS,
  ...SITE_MCP_SSH_TOOLS,
  ...SITE_MCP_JOB_TOOLS
]

export type SiteMcpToolDescriptor = {
  name: string
  description: string
  inputSchema: SiteMcpJsonSchema
}

/** The `tools/list` payload: descriptors only, never the handlers. */
export function listSiteMcpToolDescriptors(): SiteMcpToolDescriptor[] {
  return SITE_MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}

export function findSiteMcpTool(name: string): SiteMcpTool | null {
  return SITE_MCP_TOOLS.find((tool) => tool.name === name) ?? null
}

/** MCP's tool result shape. `isError` keeps a failure inside the conversation instead of the protocol. */
export type SiteMcpToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: true
}

function toolResult(payload: unknown, isError: boolean): SiteMcpToolResult {
  const content = [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }]
  return isError ? { content, isError: true } : { content }
}

/**
 * Runs one tool. A tool failure is reported as an `isError` result, not a thrown exception and not
 * a JSON-RPC error: the model needs to read the message and correct itself, and an exception
 * escaping here would take the whole stdio server down with it.
 */
export async function dispatchSiteMcpTool(
  context: SiteMcpContext,
  tool: SiteMcpTool,
  args: Record<string, unknown>
): Promise<SiteMcpToolResult> {
  try {
    return toolResult(await tool.run(context, args), false)
  } catch (error) {
    if (error instanceof SiteMcpToolError) {
      return toolResult({ ok: false, error: error.message, ...error.details }, true)
    }
    return toolResult(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      true
    )
  }
}
