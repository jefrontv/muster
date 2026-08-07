// IPC surface for chat-mode's headless stream-json transport. Start/send/stop
// route to the per-thread child registry; stream events flow back over
// `chatThreadStream:event` on the starting window's webContents.

import { ipcMain } from 'electron'
import type { ChatThreadStreamStartResult } from '../../shared/chat-thread-stream-types'
import { agentHookServer } from '../agent-hooks/server'
import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import type { Store } from '../persistence'
import {
  interruptChatThreadStream,
  respondChatThreadPermission,
  sendChatThreadStreamMessage,
  startChatThreadStream,
  stopChatThreadStream
} from '../chat-mode/chat-thread-stream'

const CHANNELS = [
  'chatThreadStream:start',
  'chatThreadStream:send',
  'chatThreadStream:respondPermission',
  'chatThreadStream:interrupt',
  'chatThreadStream:stop'
] as const

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`chatThreadStream: ${field} must be a non-empty string`)
  }
  return value
}

function asEnv(value: unknown): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('chatThreadStream: env must be a string map')
  }
  const env: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      env[key] = entry
    }
  }
  return env
}

export function registerChatThreadStreamHandlers(store: Store): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }

  ipcMain.handle(
    'chatThreadStream:start',
    async (
      event,
      args: { threadId?: unknown; command?: unknown; cwd?: unknown; env?: unknown }
    ): Promise<ChatThreadStreamStartResult> => {
      try {
        const cwd = args?.cwd === undefined ? undefined : asString(args.cwd, 'cwd')
        const env = asEnv(args?.env)
        return startChatThreadStream(
          {
            threadId: asString(args?.threadId, 'threadId'),
            command: asString(args?.command, 'command'),
            ...(cwd ? { cwd } : {}),
            ...(env ? { env } : {}),
            sender: event.sender
          },
          {
            // Same hook-coordinate source and settings gate as PTY spawns, so
            // the user's Claude hooks post status for this child identically.
            hookEnv: () =>
              isAgentStatusHooksEnabled(store.getSettings()) ? agentHookServer.buildPtyEnv() : {}
          }
        )
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    'chatThreadStream:send',
    async (_event, threadId: unknown, text: unknown, imagePaths: unknown): Promise<boolean> =>
      sendChatThreadStreamMessage(
        asString(threadId, 'threadId'),
        // Empty text is valid for an images-only send.
        typeof text === 'string' ? text : '',
        Array.isArray(imagePaths)
          ? imagePaths.filter((path): path is string => typeof path === 'string')
          : undefined
      )
  )

  ipcMain.handle(
    'chatThreadStream:respondPermission',
    async (
      _event,
      args: {
        threadId?: unknown
        requestId?: unknown
        behavior?: unknown
        message?: unknown
        updatedInput?: unknown
      }
    ): Promise<boolean> => {
      const behavior = args?.behavior
      if (behavior !== 'allow' && behavior !== 'deny') {
        throw new Error('chatThreadStream: behavior must be "allow" or "deny"')
      }
      return respondChatThreadPermission({
        threadId: asString(args?.threadId, 'threadId'),
        requestId: asString(args?.requestId, 'requestId'),
        behavior,
        ...(typeof args?.message === 'string' ? { message: args.message } : {}),
        ...(args?.updatedInput !== undefined ? { updatedInput: args.updatedInput } : {})
      })
    }
  )

  ipcMain.handle(
    'chatThreadStream:interrupt',
    async (_event, threadId: unknown): Promise<boolean> =>
      interruptChatThreadStream(asString(threadId, 'threadId'))
  )

  ipcMain.handle('chatThreadStream:stop', async (_event, threadId: unknown): Promise<void> => {
    stopChatThreadStream(asString(threadId, 'threadId'))
  })
}
