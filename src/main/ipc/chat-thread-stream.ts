// IPC surface for chat-mode's headless stream-json transport. Start/send/stop
// route to the per-thread child registry; stream events flow back over
// `chatThreadStream:event` on the starting window's webContents.

import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import type {
  ChatThreadMessageQueueSnapshot,
  ChatThreadSendOutcome,
  ChatThreadStreamStartResult
} from '../../shared/chat-thread-stream-types'
import { agentHookServer } from '../agent-hooks/server'
import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import type { Store } from '../persistence'
import { chatConnectorMcpForStream } from './chat-connector'
import { chatStore } from '../chat-mode/chat-workspace-store-singleton'
import { chatEngine } from '../chat-mode/engine/chat-engine-singleton'
import { setChatStreamFilesRoot } from '../chat-mode/chat-thread-stream-files'
import { hasClaudeAuthEnvConflict } from '../claude-accounts/environment'
import type { ClaudeRuntimeAuthPreparation } from '../claude-accounts/runtime-auth-service'
import { isClaudeAuthSwitchInProgress } from '../claude-accounts/live-pty-gate'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import { startChatStreamReaper } from '../chat-mode/chat-thread-stream-reaper'
import {
  interruptChatThreadStream,
  listChatThreadMessageQueues,
  listPendingChatThreadPermissionRequests,
  removeChatThreadQueuedMessage,
  respondChatThreadPermission,
  sendChatThreadStreamMessage,
  sendNextChatThreadQueuedMessage,
  startChatThreadStream,
  steerChatThreadQueuedMessage,
  stopChatThreadStream,
  waitForChatThreadStreamExit
} from '../chat-mode/chat-thread-stream'

const CHANNELS = [
  'chatThreadStream:start',
  'chatThreadStream:send',
  'chatThreadStream:respondPermission',
  'chatThreadStream:interrupt',
  'chatThreadStream:stop',
  'chatThreadStream:pendingPermissions',
  'chatThreadStream:steerQueued',
  'chatThreadStream:removeQueued',
  'chatThreadStream:sendNextQueued',
  'chatThreadStream:queues'
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

const AUTH_SWITCH_ERROR = 'A Claude account switch is in progress. Try again after it finishes.'

/** Same managed-account preparation as a Claude PTY launch (R12). */
async function prepareChatClaudeAuth(
  agentEnv: CommitMessageAgentEnvironmentResolvers | undefined,
  env: Record<string, string> | undefined
): Promise<ClaudeRuntimeAuthPreparation | null> {
  if (isClaudeAuthSwitchInProgress()) {
    throw new Error(AUTH_SWITCH_ERROR)
  }
  const auth = (await agentEnv?.prepareForClaudeLaunch?.()) ?? null
  if (isClaudeAuthSwitchInProgress()) {
    throw new Error(AUTH_SWITCH_ERROR)
  }
  if (auth?.stripAuthEnv && hasClaudeAuthEnvConflict(env)) {
    throw new Error(
      'This chat defines Anthropic auth environment variables. Remove them before using a managed Claude account.'
    )
  }
  return auth
}

let stopReaper: (() => void) | null = null

export function registerChatThreadStreamHandlers(
  store: Store,
  agentEnv?: CommitMessageAgentEnvironmentResolvers
): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  setChatStreamFilesRoot(join(app.getPath('userData'), 'chat-stream'))
  stopReaper?.()
  stopReaper = startChatStreamReaper(chatEngine())

  ipcMain.handle(
    'chatThreadStream:start',
    async (
      event,
      args: {
        threadId?: unknown
        command?: unknown
        cwd?: unknown
        env?: unknown
        appendSystemPrompt?: unknown
      }
    ): Promise<ChatThreadStreamStartResult> => {
      try {
        const cwd = args?.cwd === undefined ? undefined : asString(args.cwd, 'cwd')
        const env = asEnv(args?.env)
        const appendSystemPrompt =
          typeof args?.appendSystemPrompt === 'string' && args.appendSystemPrompt !== ''
            ? args.appendSystemPrompt
            : undefined
        const threadId = asString(args?.threadId, 'threadId')
        const claudeAuth = await prepareChatClaudeAuth(agentEnv, env)
        // In-process muster MCP: a failed connector start degrades to no tools.
        const mcp = await chatConnectorMcpForStream(store)
        // A relaunch's old child must close first: two CLIs on one session corrupt its transcript.
        stopChatThreadStream(threadId)
        await waitForChatThreadStreamExit(threadId)
        // Checked after the awaits: a thread deleted mid-launch would get a child nothing can stop.
        if (
          !chatStore()
            .getState()
            .threads.some((thread) => thread.id === threadId)
        ) {
          return { ok: false, error: 'This chat thread was deleted.' }
        }
        return startChatThreadStream(
          {
            threadId,
            command: asString(args?.command, 'command'),
            ...(cwd ? { cwd } : {}),
            ...(env ? { env } : {}),
            ...(appendSystemPrompt ? { appendSystemPrompt } : {}),
            sender: event.sender
          },
          {
            // Same hook-coordinate source and settings gate as PTY spawns, so
            // the user's Claude hooks post status for this child identically.
            hookEnv: () =>
              isAgentStatusHooksEnabled(store.getSettings()) ? agentHookServer.buildPtyEnv() : {},
            ...(mcp ? { mcp } : {}),
            claudeAuth,
            // Off until the new thread view resumes parked chats; the old view shows them as ended.
            idleReap: false,
            engine: { engine: chatEngine(), initialize: {} }
          }
        )
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle(
    'chatThreadStream:send',
    async (
      _event,
      threadId: unknown,
      text: unknown,
      imagePaths: unknown,
      mode: unknown
    ): Promise<ChatThreadSendOutcome> =>
      sendChatThreadStreamMessage(
        asString(threadId, 'threadId'),
        // Empty text is valid for an images-only send.
        typeof text === 'string' ? text : '',
        Array.isArray(imagePaths)
          ? imagePaths.filter((path): path is string => typeof path === 'string')
          : undefined,
        mode === 'steer' ? 'steer' : 'auto'
      )
  )

  ipcMain.handle(
    'chatThreadStream:steerQueued',
    async (_event, threadId: unknown, messageId: unknown): Promise<boolean> =>
      steerChatThreadQueuedMessage(asString(threadId, 'threadId'), asString(messageId, 'messageId'))
  )

  ipcMain.handle(
    'chatThreadStream:removeQueued',
    async (_event, threadId: unknown, messageId: unknown): Promise<boolean> =>
      removeChatThreadQueuedMessage(
        asString(threadId, 'threadId'),
        asString(messageId, 'messageId')
      )
  )

  ipcMain.handle(
    'chatThreadStream:sendNextQueued',
    async (_event, threadId: unknown): Promise<boolean> =>
      sendNextChatThreadQueuedMessage(asString(threadId, 'threadId'))
  )

  ipcMain.handle(
    'chatThreadStream:queues',
    async (): Promise<{ threadId: string; queue: ChatThreadMessageQueueSnapshot }[]> =>
      listChatThreadMessageQueues()
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
        updatedPermissions?: unknown
        interrupt?: unknown
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
        ...(args?.updatedInput !== undefined ? { updatedInput: args.updatedInput } : {}),
        ...(Array.isArray(args?.updatedPermissions)
          ? { updatedPermissions: args.updatedPermissions }
          : {}),
        ...(args?.interrupt === true ? { interrupt: true } : {})
      })
    }
  )

  ipcMain.handle(
    'chatThreadStream:interrupt',
    async (_event, threadId: unknown): Promise<boolean> =>
      interruptChatThreadStream(asString(threadId, 'threadId'))
  )

  ipcMain.handle(
    'chatThreadStream:pendingPermissions',
    async (): Promise<
      { threadId: string; requestId: string; toolName: string; input: unknown }[]
    > => listPendingChatThreadPermissionRequests()
  )

  ipcMain.handle('chatThreadStream:stop', async (_event, threadId: unknown): Promise<void> => {
    stopChatThreadStream(asString(threadId, 'threadId'))
  })
}
