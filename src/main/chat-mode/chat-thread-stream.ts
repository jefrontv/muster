// Headless stream-json child processes behind chat-mode threads. One child per
// thread; stdout NDJSON becomes compact renderer events, stdin carries user
// turns. The Claude transcript file stays the message source of truth — this
// transport only streams deltas and lifecycle.

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { homedir } from 'node:os'
import { CHAT_THREAD_STREAM_EVENT_CHANNEL } from '../../shared/chat-thread-stream-types'
import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'
import { createChatThreadStreamDecoder, resultModelWindows } from './chat-thread-stream-decode'
import { recordClaudeModelSighting } from './claude-model-registry'
import { createCoalescingStreamEmitter } from './chat-thread-stream-delta-coalesce'
import { commandWithAppendedSystemPromptFile } from './chat-thread-stream-system-prompt'
import {
  commandWithMcpConfigFile,
  removeChatThreadMcpConfigFile
} from './chat-thread-stream-mcp-config'
import { buildChatStreamUserContent, readChatStreamImages } from './chat-thread-stream-user-content'
import { buildPermissionControlResponse } from './chat-thread-permission-response'

const STDERR_TAIL_LIMIT = 4_096
const STOP_KILL_GRACE_MS = 1_500

// Stale inherited hook coordinates would route this child's hook POSTs to a
// dead receiver; strip them before injecting the live server's env.
const INHERITED_HOOK_ENV_KEYS = [
  'ORCA_AGENT_HOOK_PORT',
  'ORCA_AGENT_HOOK_TOKEN',
  'ORCA_AGENT_HOOK_ENV',
  'ORCA_AGENT_HOOK_VERSION',
  'ORCA_AGENT_HOOK_ENDPOINT'
] as const

export type ChatThreadStreamSender = {
  send: (channel: string, payload: ChatThreadStreamEvent) => void
  isDestroyed: () => boolean
}

export type ChatThreadStreamSpawn = (
  command: string,
  args: string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv }
) => ChildProcess

export type ChatThreadStreamDeps = {
  spawn?: ChatThreadStreamSpawn
  /** Live hook-server coordinates (ORCA_AGENT_HOOK_*), same source as PTY spawns. */
  hookEnv?: () => Record<string, string>
  /** Chat-connector MCP coordinates: register mints the thread's bearer token
   *  before spawn, revoke retires it on stop/close (token-matched, so a stale
   *  child's late close can't kill a relaunch's fresh token). */
  mcp?: {
    register: (threadId: string) => { url: string; token: string } | null
    revoke: (threadId: string, token: string) => void
  }
}

type StreamEntry = {
  child: ChildProcess
  /** True once the renderer asked for the stop; suppresses the exit event so an
   *  intentional stop/relaunch never races the renderer's session bookkeeping. */
  stopping: boolean
  killTimer: ReturnType<typeof setTimeout> | null
  /** can_use_tool requests awaiting a renderer verdict, by request id. The input
   *  is kept so an allow without updatedInput echoes it back; the tool name so a
   *  reloaded renderer can rebuild the prompt. Entries are denied on stop so the
   *  CLI never hangs on an unanswerable question. */
  pendingPermissionRequests: Map<string, { toolName: string; input: unknown }>
  /** Outgoing control_request id counter (interrupts) — unique per child. */
  controlRequestCounter: number
  /** Revokes the muster MCP token + deletes the config file; runs once. */
  mcpCleanup: (() => void) | null
}

const registry = new Map<string, StreamEntry>()

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
): { ok: boolean; error?: string } {
  const { threadId, cwd, env, sender } = args
  if (process.platform === 'win32') {
    // Command quoting is built for a POSIX shell; a clean error beats a
    // mis-quoted cmd.exe launch. Windows support lands with its own shell plan.
    return { ok: false, error: 'Chat threads are not supported on Windows yet.' }
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
  const mcpCleanup =
    mcp && mcpRegistration
      ? (): void => {
          mcp.revoke(threadId, mcpRegistration.token)
          removeChatThreadMcpConfigFile(threadId)
        }
      : null

  const mergedEnv: NodeJS.ProcessEnv = { ...process.env }
  for (const key of INHERITED_HOOK_ENV_KEYS) {
    delete mergedEnv[key]
  }
  Object.assign(mergedEnv, env ?? {}, deps.hookEnv?.() ?? {})

  // Same default-shell resolution the local PTY provider uses for POSIX spawns.
  const shellPath = env?.SHELL || process.env.SHELL || '/bin/zsh'
  const spawnFn = deps.spawn ?? defaultSpawn
  let child: ChildProcess
  try {
    child = spawnFn(shellPath, ['-lc', command], {
      // Standalone chats have no workspace dir; home beats inheriting the
      // Electron process cwd (repo dir in dev, filesystem root when packaged).
      cwd: cwd ?? homedir(),
      env: mergedEnv
    })
  } catch (error) {
    mcpCleanup?.()
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const entry: StreamEntry = {
    child,
    stopping: false,
    killTimer: null,
    pendingPermissionRequests: new Map(),
    controlRequestCounter: 0,
    mcpCleanup
  }
  registry.set(threadId, entry)

  const send = (event: ChatThreadStreamEvent): void => {
    if (sender.isDestroyed()) {
      return
    }
    try {
      sender.send(CHAT_THREAD_STREAM_EVENT_CHANNEL, event)
    } catch {
      // A closing window can destroy the sender between the check and the send.
    }
  }
  const emitter = createCoalescingStreamEmitter(threadId, send)
  const emit = (event: ChatThreadStreamEvent): void => {
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
  }
  const decoder = createChatThreadStreamDecoder(threadId, emit, (record) => {
    // Learn every model the CLI reports so new models adapt without a release.
    for (const entry of resultModelWindows(record)) {
      void recordClaudeModelSighting({ model: entry.model, contextWindow: entry.contextWindow })
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
    entry.mcpCleanup?.()
    entry.mcpCleanup = null
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

function writeStdinLine(entry: StreamEntry, payload: unknown): boolean {
  const stdin = entry.child.stdin
  if (entry.stopping || !stdin || stdin.destroyed || !stdin.writable) {
    return false
  }
  try {
    stdin.write(`${JSON.stringify(payload)}\n`)
  } catch {
    return false
  }
  return true
}

export async function sendChatThreadStreamMessage(
  threadId: string,
  text: string,
  imagePaths?: readonly string[]
): Promise<boolean> {
  if (!registry.has(threadId)) {
    return false
  }
  const { images } = imagePaths?.length
    ? await readChatStreamImages(imagePaths)
    : { images: [] as Awaited<ReturnType<typeof readChatStreamImages>>['images'] }
  // Re-check: the child can die during the file reads.
  const entry = registry.get(threadId)
  if (!entry) {
    return false
  }
  const content = buildChatStreamUserContent(text, images)
  if (content.length === 0) {
    return false
  }
  return writeStdinLine(entry, {
    type: 'user',
    message: { role: 'user', content }
  })
}

export function respondChatThreadPermission(args: {
  threadId: string
  requestId: string
  behavior: 'allow' | 'deny'
  message?: string
  updatedInput?: unknown
}): boolean {
  const entry = registry.get(args.threadId)
  if (!entry) {
    return false
  }
  // A stale request_id (turn already interrupted) is written anyway; the CLI
  // tolerates unknown ids silently (verified against 2.1.224).
  const originalInput = entry.pendingPermissionRequests.get(args.requestId)?.input
  entry.pendingPermissionRequests.delete(args.requestId)
  return writeStdinLine(
    entry,
    buildPermissionControlResponse({
      ...args,
      updatedInput: args.updatedInput ?? originalInput
    })
  )
}

export function interruptChatThreadStream(threadId: string): boolean {
  const entry = registry.get(threadId)
  if (!entry) {
    return false
  }
  entry.controlRequestCounter += 1
  return writeStdinLine(entry, {
    type: 'control_request',
    request_id: `req_${entry.controlRequestCounter}`,
    request: { subtype: 'interrupt' }
  })
}

/** Every can_use_tool question still awaiting a verdict, across live threads.
 *  A renderer that reloaded mid-question has no record of it, and the CLI blocks
 *  until someone answers — so the renderer re-reads them on mount. */
export function listPendingChatThreadPermissionRequests(): {
  threadId: string
  requestId: string
  toolName: string
  input: unknown
}[] {
  const pending: { threadId: string; requestId: string; toolName: string; input: unknown }[] = []
  for (const [threadId, entry] of registry) {
    if (entry.stopping) {
      continue
    }
    for (const [requestId, request] of entry.pendingPermissionRequests) {
      pending.push({ threadId, requestId, toolName: request.toolName, input: request.input })
    }
  }
  return pending
}

export function stopChatThreadStream(threadId: string): void {
  const entry = registry.get(threadId)
  if (!entry || entry.stopping) {
    return
  }
  // Deny outstanding permission questions before closing stdin, so the CLI's
  // pending tool_use settles instead of dangling into the kill.
  for (const [requestId] of entry.pendingPermissionRequests) {
    writeStdinLine(
      entry,
      buildPermissionControlResponse({
        requestId,
        behavior: 'deny',
        message: 'The chat session was closed.'
      })
    )
  }
  entry.pendingPermissionRequests.clear()
  entry.stopping = true
  entry.mcpCleanup?.()
  entry.mcpCleanup = null
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
