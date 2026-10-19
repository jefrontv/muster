// Reasons a chat thread's stream must not spawn at all, checked before any MCP
// token or temp file exists for it.

import { existsSync } from 'node:fs'
import type { ChatThreadStreamStartResult } from '../../shared/chat-thread-stream-types'

export function chatThreadStreamPreflightFailure(
  cwd: string | undefined
): ChatThreadStreamStartResult | null {
  // A missing cwd makes spawn report the shell itself as ENOENT, which reads as a broken install.
  if (cwd && !existsSync(cwd)) {
    return { ok: false, error: `Folder not found: ${cwd}`, reason: 'folder-missing' }
  }
  return null
}
