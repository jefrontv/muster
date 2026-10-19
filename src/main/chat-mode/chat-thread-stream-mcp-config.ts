// Writes the per-thread MCP config next to the stream child and returns
// its --mcp-config args, mirroring chat-thread-stream-system-prompt's tmp-file pattern.
// Deliberately no --strict-mcp-config: the user's own MCP servers keep loading.

import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chatStreamFilesDir, ensureChatStreamFilesDir } from './chat-thread-stream-files'

const MCP_CONFIG_DIR_NAME = 'muster-chat-mcp'

function mcpConfigFilePath(threadId: string): string {
  return join(chatStreamFilesDir(MCP_CONFIG_DIR_NAME), `${threadId}.json`)
}

export function mcpConfigArgs(
  connector: { url: string; token: string },
  threadId: string
): string[] {
  ensureChatStreamFilesDir(MCP_CONFIG_DIR_NAME)
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
  return ['--mcp-config', file]
}

export function removeChatThreadMcpConfigFile(threadId: string): void {
  try {
    rmSync(mcpConfigFilePath(threadId), { force: true })
  } catch {
    // Best-effort cleanup; the token inside was already revoked.
  }
}
