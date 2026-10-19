// Stopping a stream child. stdin EOF lets Claude Code exit and clean up after
// itself; SIGTERM then SIGKILL go to its process group so Bash-tool children
// (dev servers, watchers) die with it. A relaunch waits for the old child so two
// CLIs never write the same session transcript at once.

import type { ChildProcess } from 'node:child_process'

const TERM_AFTER_MS = 1_500
const KILL_AFTER_MS = 5_000

const exiting = new Map<string, Promise<void>>()

function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid && process.platform !== 'win32') {
    try {
      // Negative pid: the whole group. Children are spawned detached, so they lead one.
      process.kill(-child.pid, signal)
      return
    } catch {
      // Not a group leader, or already gone; fall back to the child alone.
    }
  }
  try {
    child.kill(signal)
  } catch {
    // Exited between the check and the signal.
  }
}

/** Escalates after stdin was closed; `closed` settles when the child is gone. */
export function escalateChatStreamStop(
  threadId: string,
  child: ChildProcess,
  closed: Promise<void>
): void {
  let killTimer: ReturnType<typeof setTimeout> | null = null
  const termTimer = setTimeout(() => {
    signalChild(child, 'SIGTERM')
    killTimer = setTimeout(() => signalChild(child, 'SIGKILL'), KILL_AFTER_MS)
    killTimer.unref?.()
  }, TERM_AFTER_MS)
  // Don't hold app quit hostage; the CLI exits on stdin EOF anyway.
  termTimer.unref?.()
  exiting.set(threadId, closed)
  void closed.then(() => {
    clearTimeout(termTimer)
    if (killTimer) {
      clearTimeout(killTimer)
    }
    if (exiting.get(threadId) === closed) {
      exiting.delete(threadId)
    }
  })
}

/** Resolves once the thread's stopping child has closed (or the kill deadline passed). */
export async function waitForChatThreadStreamExit(
  threadId: string,
  timeoutMs = TERM_AFTER_MS + KILL_AFTER_MS + 500
): Promise<void> {
  const closed = exiting.get(threadId)
  if (!closed) {
    return
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  await Promise.race([
    closed,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
    })
  ])
  if (timer) {
    clearTimeout(timer)
  }
}
