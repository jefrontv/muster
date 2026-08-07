// Headless stream-json child processes behind chat-mode threads. One child per
// thread; stdout NDJSON becomes compact renderer events, stdin carries user
// turns. The Claude transcript file stays the message source of truth — this
// transport only streams deltas and lifecycle.

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { CHAT_THREAD_STREAM_EVENT_CHANNEL } from '../../shared/chat-thread-stream-types'
import type { ChatThreadStreamEvent } from '../../shared/chat-thread-stream-types'
import { createChatThreadStreamDecoder } from './chat-thread-stream-decode'

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
}

type StreamEntry = {
  child: ChildProcess
  /** True once the renderer asked for the stop; suppresses the exit event so an
   *  intentional stop/relaunch never races the renderer's session bookkeeping. */
  stopping: boolean
  killTimer: ReturnType<typeof setTimeout> | null
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
    sender: ChatThreadStreamSender
  },
  deps: ChatThreadStreamDeps = {}
): { ok: boolean; error?: string } {
  const { threadId, command, cwd, env, sender } = args
  if (process.platform === 'win32') {
    // Command quoting is built for a POSIX shell; a clean error beats a
    // mis-quoted cmd.exe launch. Windows support lands with its own shell plan.
    return { ok: false, error: 'Chat threads are not supported on Windows yet.' }
  }
  // Replace semantics: a relaunch for the same thread supersedes the old child.
  stopChatThreadStream(threadId)

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
      ...(cwd ? { cwd } : {}),
      env: mergedEnv
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  const entry: StreamEntry = { child, stopping: false, killTimer: null }
  registry.set(threadId, entry)

  const emit = (event: ChatThreadStreamEvent): void => {
    if (sender.isDestroyed()) {
      return
    }
    try {
      sender.send(CHAT_THREAD_STREAM_EVENT_CHANNEL, event)
    } catch {
      // A closing window can destroy the sender between the check and the send.
    }
  }
  const decoder = createChatThreadStreamDecoder(threadId, emit)
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

export function sendChatThreadStreamMessage(threadId: string, text: string): boolean {
  const entry = registry.get(threadId)
  const stdin = entry?.child.stdin
  if (!entry || entry.stopping || !stdin || stdin.destroyed || !stdin.writable) {
    return false
  }
  const payload = {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] }
  }
  try {
    stdin.write(`${JSON.stringify(payload)}\n`)
  } catch {
    return false
  }
  return true
}

export function stopChatThreadStream(threadId: string): void {
  const entry = registry.get(threadId)
  if (!entry || entry.stopping) {
    return
  }
  entry.stopping = true
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
