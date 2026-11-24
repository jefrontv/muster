// Muster Pages over the chat connector: the same tools terminal agents get, scoped by the
// chat's workspace folder, so a chat in a project folder works on that project's pages.
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { splitToolImage } from '../../shared/tool-result-image'
import { pagesToolOp, SITE_MCP_PAGES_TOOLS } from '../sites/mcp/site-mcp-pages-tools'
import {
  toolFail,
  toolOk,
  type ChatConnectorCallContext,
  type ChatConnectorToolDeps,
  type ChatConnectorToolResult
} from './chat-connector-tool-context'

export const CHAT_CONNECTOR_PAGES_AGENT = 'Muster chat'

export function chatConnectorPagesToolDefs(deps: ChatConnectorToolDeps): Tool[] {
  const access = deps.projectPages?.access() ?? 'off'
  if (access === 'off') {
    return []
  }
  return SITE_MCP_PAGES_TOOLS.filter(
    (tool) => access === 'write' || tool.pagesAccess === 'read'
  ).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Tool['inputSchema']
  }))
}

/** null when the name is not a pages tool. */
export async function callChatConnectorPagesTool(
  ctx: ChatConnectorCallContext,
  name: string,
  args: Record<string, unknown>
): Promise<ChatConnectorToolResult | null> {
  const op = pagesToolOp(name)
  if (!op) {
    return null
  }
  const pages = ctx.deps.projectPages
  if (!pages || pages.access() === 'off') {
    return toolFail('Muster Pages are turned off for agents in Settings.')
  }
  try {
    const value = await pages.run(op, args, {
      cwd: ctx.workspace?.directories[0] ?? '',
      agent: CHAT_CONNECTOR_PAGES_AGENT,
      worktreeId: null,
      terminalHandle: null
    })
    const { rest, image } = splitToolImage(value)
    const result = toolOk(JSON.stringify(rest, null, 2))
    return image ? { content: [...result.content, { type: 'image', ...image }] } : result
  } catch (error) {
    const revision = (error as { revision?: unknown }).revision
    const message = error instanceof Error ? error.message : String(error)
    return toolFail(
      typeof revision === 'number' ? `${message} (current revision ${revision})` : message
    )
  }
}
