// Reasons a chat thread's stream must not spawn at all, checked before any MCP
// token or temp file exists for it.

import { existsSync } from 'node:fs'
import type { ChatThreadStreamStartResult } from '../../shared/chat-thread-stream-types'

export function chatThreadStreamPreflightFailure(
  cwd: string | undefined
): ChatThreadStreamStartResult | null {
  if (process.platform === 'win32') {
    // Command quoting is built for a POSIX shell; a clean error beats a
    // mis-quoted cmd.exe launch. Windows support lands with its own shell plan.
    return { ok: false, error: 'Chat threads are not supported on Windows yet.' }
  }
  // A missing cwd makes spawn report the shell itself as ENOENT, which reads as a broken install.
  if (cwd && !existsSync(cwd)) {
    return { ok: false, error: `Folder not found: ${cwd}`, reason: 'folder-missing' }
  }
  return null
}
