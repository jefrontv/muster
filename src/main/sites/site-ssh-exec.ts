// Streaming consumer for one remote exec channel.
//
// Orca's execCommand (src/main/ssh/ssh-relay-exec-command.ts) collects to a string under a 30s
// deadline and rejects on a non-zero exit. Both are wrong for site runs: mysqldump and a theme
// deploy run for minutes, and the caller — not the transport — decides what a non-zero exit means.

import type { ClientChannel } from 'ssh2'
import {
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteExecOptions,
  type SiteExecResult
} from './pipeline-contract'

/** ocsites' `_exec_command_with_timeout` default (deploy/backup.py:305). `timeoutMs: 0` disables it. */
export const DEFAULT_SITE_EXEC_TIMEOUT_MS = 600_000

export const SITE_EXEC_STEP = 'ssh-exec'

/**
 * Cap on the buffered copy returned in SiteExecResult. Unbounded output must be consumed through
 * onStdout/onStderr, which see every byte; the returned strings keep only the tail.
 */
const MAX_BUFFERED_OUTPUT_CHARS = 1024 * 1024

/** How long to wait for CHANNEL_CLOSE after asking for termination before settling anyway. */
const CHANNEL_CLOSE_GRACE_MS = 5_000

const MAX_COMMAND_CHARS_IN_ERROR = 200

/**
 * Drives `channel` to completion and resolves the exit code even when it is non-zero.
 * Rejects only for cancellation (SiteRunCancelledError), a timeout, or a channel error.
 */
export function consumeSiteExecChannel(
  channel: ClientChannel,
  command: string,
  signal: AbortSignal,
  options?: SiteExecOptions
): Promise<SiteExecResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SITE_EXEC_TIMEOUT_MS
  return new Promise<SiteExecResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let terminationError: Error | null = null
    let closeGraceTimer: NodeJS.Timeout | undefined
    // Why: a mysqldump has no meaningful wall-clock budget, so timeoutMs 0 must arm no timer at
    // all rather than schedule a huge delay that still fires on a slow-but-live transfer.
    let timeoutTimer: NodeJS.Timeout | undefined

    const cleanup = (): void => {
      clearTimeout(timeoutTimer)
      clearTimeout(closeGraceTimer)
      signal.removeEventListener('abort', onAbort)
      channel.off('error', onChannelError)
      channel.stderr.off('error', onChannelError)
      channel.off('data', onStdoutData)
      channel.stderr.off('data', onStderrData)
      channel.off('close', onClose)
    }
    const succeed = (result: SiteExecResult): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(result)
    }
    const abandon = (error: Error): void => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(error)
    }
    // Why: sshd holds the session against MaxSessions until CHANNEL_CLOSE completes. Settling
    // before the channel actually closes leaks the slot, and the next exec is refused.
    const requestTermination = (error: Error): void => {
      if (terminationError) {
        return
      }
      terminationError = error
      clearTimeout(timeoutTimer)
      closeGraceTimer = setTimeout(() => {
        drainAbandonedChannel(channel)
        abandon(error)
      }, CHANNEL_CLOSE_GRACE_MS)
      channel.close()
    }
    const onChannelError = (error: Error): void => requestTermination(error)
    const onAbort = (): void => requestTermination(new SiteRunCancelledError())
    const onStdoutData = (data: Buffer): void => {
      const chunk = data.toString('utf-8')
      options?.onStdout?.(chunk)
      stdout = appendTail(stdout, chunk)
    }
    const onStderrData = (data: Buffer): void => {
      const chunk = data.toString('utf-8')
      options?.onStderr?.(chunk)
      stderr = appendTail(stderr, chunk)
    }
    const onClose = (code: number | null): void => {
      if (terminationError) {
        abandon(terminationError)
        return
      }
      succeed({ code: code ?? -1, stdout, stderr })
    }

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        const seconds = Math.round(timeoutMs / 1000)
        requestTermination(
          new SiteRunStepError(
            SITE_EXEC_STEP,
            `Remote command timed out after ${seconds}s: ${summarize(command)}`
          )
        )
      }, timeoutMs)
    }

    signal.addEventListener('abort', onAbort, { once: true })
    channel.on('error', onChannelError)
    channel.stderr.on('error', onChannelError)
    channel.on('data', onStdoutData)
    channel.stderr.on('data', onStderrData)
    channel.on('close', onClose)
    if (signal.aborted) {
      onAbort()
    }
  })
}

/**
 * Keep draining a channel we have stopped waiting on so ssh2 can finish CHANNEL_CLOSE, and swallow
 * the late errors a torn-down transport emits after the caller has already been settled.
 */
function drainAbandonedChannel(channel: ClientChannel): void {
  const swallow = (): void => {}
  const stopSwallowing = (): void => {
    channel.off('error', swallow)
    channel.stderr.off('error', swallow)
  }
  channel.on('error', swallow)
  channel.stderr.on('error', swallow)
  channel.once('close', stopSwallowing)
  channel.resume()
  channel.stderr.resume()
}

function appendTail(existing: string, chunk: string): string {
  const combined = existing + chunk
  return combined.length > MAX_BUFFERED_OUTPUT_CHARS
    ? combined.slice(-MAX_BUFFERED_OUTPUT_CHARS)
    : combined
}

function summarize(command: string): string {
  return command.length > MAX_COMMAND_CHARS_IN_ERROR
    ? `${command.slice(0, MAX_COMMAND_CHARS_IN_ERROR)}…`
    : command
}
