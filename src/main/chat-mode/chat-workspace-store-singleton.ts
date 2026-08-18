// Shared ChatWorkspaceStore instance: chat-mode IPC and the chat connector's
// MCP tools must edit the same in-memory state, not two competing files.

import { app } from 'electron'
import { ChatWorkspaceStore } from './chat-workspace-store'

let storeSingleton: ChatWorkspaceStore | null = null

export function chatStore(): ChatWorkspaceStore {
  if (!storeSingleton) {
    storeSingleton = new ChatWorkspaceStore(app.getPath('userData'))
    app.on('before-quit', () => storeSingleton?.flush())
  }
  return storeSingleton
}
