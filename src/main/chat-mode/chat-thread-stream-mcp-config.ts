// Writes the per-thread MCP config next to the stream child and appends
// --mcp-config, mirroring chat-thread-stream-system-prompt's tmp-file pattern.
// Deliberately no --strict-mcp-config: the user's own MCP servers keep loading.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MCP_CONFIG_DIR_NAME = 'muster-chat-mcp'

function mcpConfigFilePath(threadId: string): string {
  return join(tmpdir(), MCP_CONFIG_DIR_NAME, `${threadId}.json`)
}

export function commandWithMcpConfigFile(
  command: string,
  connector: { url: string; token: string },
  threadId: string
): string {
  mkdirSync(join(tmpdir(), MCP_CONFIG_DIR_NAME), { recursive: true })
  const file = mcpConfigFilePath(threadId)
  const config = {
    mcpServers: {
      muster: {
        type: 'http',
        url: connector.url,
        headers: { Authorization: `Bearer ${connector.token}` }
      }
    }
  }
  // 0600: the file carries the thread's bearer token.
  writeFileSync(file, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 })
  const quoted = `'${file.replace(/'/g, `'\\''`)}'`
  return `${command} --mcp-config ${quoted}`
}

export function removeChatThreadMcpConfigFile(threadId: string): void {
  try {
    rmSync(mcpConfigFilePath(threadId), { force: true })
  } catch {
    // Best-effort cleanup; the token inside was already revoked.
  }
}
