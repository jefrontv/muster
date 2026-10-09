// Headless stream-json child processes behind chat-mode threads. One child per
// thread; stdout NDJSON becomes compact renderer events, stdin carries user
// turns. The Claude transcript file stays the message source of truth — this
// transport only streams deltas and lifecycle.

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { buildChatThreadStreamSpawnPlan } from './chat-thread-stream-spawn-plan'
import { chatThreadStreamPreflightFailure } from './chat-thread-stream-preflight'
import { CHAT_THREAD_STREAM_EVENT_CHANNEL } from '../../shared/chat-thread-stream-types'
import type {
  ChatThreadStreamEvent,
  ChatThreadStreamStartResult
} from '../../shared/chat-thread-stream-types'
import {
  createChatThreadStreamDecoder,
  replayedUserMessageId,
  resultModelWindows
} from './chat-thread-stream-decode'
import { createChatThreadMessageQueue } from './chat-thread-message-queue'
import { recordClaudeModelSighting } from './claude-model-registry'
import { createCoalescingStreamEmitter } from './chat-thread-stream-delta-coalesce'
import {
  commandWithAppendedSystemPromptFile,
  removeChatThreadSystemPromptFile
} from './chat-thread-stream-system-prompt'
import {
  commandWithMcpConfigFile,
  removeChatThreadMcpConfigFile
} from './chat-thread-stream-mcp-config'
import { buildPermissionControlResponse } from './chat-thread-permission-response'
import type { ChatThreadStreamDeps, ChatThreadStreamSender } from './chat-thread-stream-deps'
import { registry, writeStdinLine, type StreamEntry } from './chat-thread-stream-registry'
import { writeUserMessage } from './chat-thread-stream-actions'

export type {
  ChatThreadStreamDeps,
  ChatThreadStreamSender,
  ChatThreadStreamSpawn
} from './chat-thread-stream-deps'
export {
  listChatThreadMessageQueues,
  listPendingChatThreadPermissionRequests,
  removeChatThreadQueuedMessage,
  respondChatThreadPermission,
  sendChatThreadStreamMessage,
  sendNextChatThreadQueuedMessage,
  steerChatThreadQueuedMessage
} from './chat-thread-stream-actions'

const STDERR_TAIL_LIMIT = 4_096
const STOP_KILL_GRACE_MS = 1_500

function defaultSpawn(
  command: string,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv }
): ChildProcess {
  return nodeSpawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] })
}

export function startChatThreadStream(
  args: {
    threadId: string
    command: string
    cwd?: string
    env?: Record<string, string>
    appendSystemPrompt?: string
    sender: ChatThreadStreamSender
  },
  deps: ChatThreadStreamDeps = {}
): ChatThreadStreamStartResult {
  const { threadId, cwd, env, sender } = args
  const preflightFailure = chatThreadStreamPreflightFailure(cwd)
  if (preflightFailure) {
    return preflightFailure
  }
  // Replace semantics: a relaunch for the same thread supersedes the old child.
  // Must run before the MCP register/write below so the old session's cleanup
  // can't delete the new session's config file or token.
  stopChatThreadStream(threadId)

  const baseCommand = args.appendSystemPrompt
    ? commandWithAppendedSystemPromptFile(args.command, args.appendSystemPrompt, threadId)
    : args.command
  const mcp = deps.mcp ?? null
  const mcpRegistration = mcp?.register(threadId) ?? null
  const command = mcpRegistration
    ? commandWithMcpConfigFile(baseCommand, mcpRegistration, threadId)
    : baseCommand
  const cleanup = (): void => {
    if (mcp && mcpRegistration) {
      mcp.revoke(threadId, mcpRegistration.token)
      removeChatThreadMcpConfigFile(threadId)
    }
    removeChatThreadSystemPromptFile(threadId)
  }

  const plan = buildChatThreadStreamSpawnPlan({
    command,
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
    ...(deps.hookEnv ? { hookEnv: deps.hookEnv } : {}),
    ...(deps.loginShellEnv ? { loginShellEnv: deps.loginShellEnv } : {})
  })
  const spawnFn = deps.spawn ?? defaultSpawn
  let child: ChildProcess
  try {
    child = spawnFn(plan.shellPath, plan.args, plan.options)
  } catch (error) {
    cleanup()
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const entry: StreamEntry = {
    child,
    stopping: false,
    killTimer: null,
    pendingPermissionRequests: new Map(),
    controlRequestCounter: 0,
    cleanup,
    emit: () => undefined,
    queue: createChatThreadMessageQueue({
      write: (message, priority) => writeUserMessage(entry, threadId, message, priority),
      onChange: (queue) => entry.emit({ threadId, kind: 'queue-changed', queue })
    })
  }
  registry.set(threadId, entry)

  const send = (event: ChatThreadStreamEvent): void => {
    if (entry.stopping || sender.isDestroyed()) {
      return
    }
    try {
      sender.send(CHAT_THREAD_STREAM_EVENT_CHANNEL, event)
    } catch {
      // A closing window can destroy the sender between the check and the send.
    }
  }
  const emitter = createCoalescingStreamEmitter(threadId, send)
  entry.emit = (event: ChatThreadStreamEvent): void => {
    // Book-keep pending can_use_tool requests so stop can deny what's open and
    // an allow verdict can echo the original input back.
    if (event.kind === 'permission-request') {
      entry.pendingPermissionRequests.set(event.requestId, {
        toolName: event.toolName,
        input: event.input
      })
    } else if (event.kind === 'permission-cancel') {
      entry.pendingPermissionRequests.delete(event.requestId)
    }
    emitter.emit(event)
    if (event.kind === 'turn-complete') {
      entry.queue.noteTurnComplete()
    }
  }
  const emit = entry.emit
  const decoder = createChatThreadStreamDecoder(threadId, emit, (record) => {
    // Learn every model the CLI reports so new models adapt without a release.
    for (const entry of resultModelWindows(record)) {
      void recordClaudeModelSighting({ model: entry.model, contextWindow: entry.contextWindow })
    }
    const deliveredId = replayedUserMessageId(record)
    if (deliveredId) {
      entry.queue.noteDelivered(deliveredId)
    }
  })
  let stderrTail = ''

  child.stdout?.setEncoding('utf-8')
  child.stdout?.on('data', (chunk: string) => decoder.push(chunk))
  child.stderr?.setEncoding('utf-8')
  child.stderr?.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_LIMIT)
  })
  child.on('error', (error) => {
    stderrTail = `${stderrTail}\n${error.message}`.slice(-STDERR_TAIL_LIMIT)
  })
  child.on('close', (code) => {
    decoder.flush()
    emitter.dispose()
    entry.cleanup?.()
    entry.cleanup = null
    if (entry.killTimer) {
      clearTimeout(entry.killTimer)
      entry.killTimer = null
    }
    if (registry.get(threadId) === entry) {
      registry.delete(threadId)
    }
    if (!entry.stopping) {
      const tail = stderrTail.trim()
      emit({ threadId, kind: 'exit', code, ...(tail ? { error: tail } : {}) })
    }
  })
  return { ok: true }
}

export function interruptChatThreadStream(threadId: string): boolean {
  const entry = registry.get(threadId)
  if (!entry) {
    return false
  }
  entry.controlRequestCounter += 1
  entry.queue.noteInterruptRequested()
  return writeStdinLine(entry, {
    type: 'control_request',
    request_id: `req_${entry.controlRequestCounter}`,
    request: { subtype: 'interrupt' }
  })
}

export function stopChatThreadStream(threadId: string): void {
  const entry = registry.get(threadId)
  if (!entry || entry.stopping) {
    return
  }
  // Deny open questions so the CLI settles before the kill; cancel retires the card (no exit event follows).
  for (const requestId of entry.pendingPermissionRequests.keys()) {
    writeStdinLine(
      entry,
      buildPermissionControlResponse({
        requestId,
        behavior: 'deny',
        message: 'The chat session was closed.'
      })
    )
    // emit() also drops the request from the pending map.
    entry.emit({ threadId, kind: 'permission-cancel', requestId })
  }
  entry.stopping = true
  entry.cleanup?.()
  entry.cleanup = null
  registry.delete(threadId)
  try {
    entry.child.stdin?.end()
  } catch {
    // stdin may already be closed; the grace kill below still applies.
  }
  entry.killTimer = setTimeout(() => {
    entry.killTimer = null
    try {
      entry.child.kill('SIGKILL')
    } catch {
      // Already exited between the timer firing and the kill — benign.
    }
  }, STOP_KILL_GRACE_MS)
  // Why: don't hold app quit or GC hostage on an already-dead child's timer.
  entry.killTimer.unref?.()
}

export function stopAllChatThreadStreams(): void {
  // Map iteration tolerates deletes made by stopChatThreadStream mid-loop.
  for (const threadId of registry.keys()) {
    stopChatThreadStream(threadId)
  }
}

/** Test-only visibility into the live registry. */
export function chatThreadStreamCountForTests(): number {
  return registry.size
}
