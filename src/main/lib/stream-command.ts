// Generic streaming spawn for site pipelines.
//
// Generalised from gitStreamStdout (src/main/git/runner.ts:960) — same per-stream StringDecoder
// so a multibyte character split across chunks is not corrupted, same byte backstop, same
// early-stop hook — but for an arbitrary binary and with two deliberate differences:
//
//   1. The child is spawned detached on POSIX and killed through killCommandTree, so ssh,
//      mysqldump and npm grandchildren die with it instead of orphaning on cancel.
//   2. The deadline is our own setTimeout. Node's `timeout` spawn option waits forever on
//      signal-ignoring CLIs like ssh (runner.ts:479).

import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { killCommandTree } from './kill-command-tree'

/** Per-stream capture backstop. Streaming consumers still see every chunk via onStdout/onStderr. */
export const DEFAULT_STREAM_COMMAND_MAX_BYTES = 10 * 1024 * 1024

export type StreamCommandOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  /** Wall-clock budget. Omit or pass 0 to disable — required for mysqldump and theme builds. */
  timeoutMs?: number
  maxBytes?: number
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  /** Written to stdin, which is then closed. Omit to give the child no stdin at all. */
  stdin?: string
  /** Return true to stop early: the tree is killed and the promise resolves with what was captured. */
  shouldStop?: (chunk: string, stream: 'stdout' | 'stderr') => boolean
}

export type StreamCommandResult = {
  /** -1 when the child was killed by abort, timeout or an early stop. */
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
  /** Capture hit maxBytes; the child kept running, only the buffer stopped growing. */
  truncated: boolean
  stoppedEarly: boolean
}

type StreamCapture = {
  text: string
  truncated: boolean
  /** Decodes and captures a chunk, returning the newly decoded text (empty on a partial sequence). */
  push: (chunk: Buffer) => string
  /** Flushes bytes the decoder was holding for an incomplete sequence. */
  end: () => void
}

function createStreamCapture(maxBytes: number): StreamCapture {
  const decoder = new StringDecoder('utf8')
  let bytes = 0
  const capture: StreamCapture = {
    text: '',
    truncated: false,
    push(chunk) {
      const decoded = decoder.write(chunk)
      bytes += chunk.byteLength
      if (bytes > maxBytes) {
        // Bound the buffer but let the child run — a chatty build must not be killed mid-upload.
        capture.truncated = true
      } else {
        capture.text += decoded
      }
      return decoded
    },
    end() {
      const tail = decoder.end()
      if (tail.length > 0 && !capture.truncated) {
        capture.text += tail
      }
    }
  }
  return capture
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

/**
 * Run a command, streaming its output. Resolves for any exit code — callers inspect `code` and
 * raise their own domain error. Rejects only on a spawn failure (ENOENT) or on abort, where the
 * rejection is an Error with `name === 'AbortError'`.
 */
export function streamCommand(
  command: string,
  args: string[],
  options: StreamCommandOptions = {}
): Promise<StreamCommandResult> {
  const { promise, resolve, reject } = Promise.withResolvers<StreamCommandResult>()
  if (options.signal?.aborted) {
    reject(createAbortError())
    return promise
  }
  const maxBytes = options.maxBytes ?? DEFAULT_STREAM_COMMAND_MAX_BYTES
  const out = createStreamCapture(maxBytes)
  const err = createStreamCapture(maxBytes)
  let settled = false
  let timedOut = false
  let stoppedEarly = false

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    // Why: the new process group is what lets killCommandTree reach ssh/mysqldump grandchildren.
    detached: process.platform !== 'win32',
    stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    windowsHide: true
  })

  const deliver = (code: number, error: Error | null): void => {
    child.stdout?.off('data', onStdoutData)
    child.stderr?.off('data', onStderrData)
    child.off('error', onError)
    child.off('close', onClose)
    options.signal?.removeEventListener('abort', onAbort)
    clearTimeout(timer)
    out.end()
    err.end()
    if (error) {
      reject(error)
      return
    }
    resolve({
      code,
      stdout: out.text,
      stderr: err.text,
      timedOut,
      truncated: out.truncated || err.truncated,
      stoppedEarly
    })
  }
  const finish = (code: number, error: Error | null): void => {
    if (settled) {
      return
    }
    settled = true
    deliver(code, error)
  }
  // Why: claim the settle up front, then wait for the tree to actually die. A cancelled run must
  // not report back while mysqldump still holds the remote database open.
  const finishAfterKill = (error: Error | null): void => {
    if (settled) {
      return
    }
    settled = true
    void killCommandTree(child).then(() => deliver(-1, error))
  }

  function handleChunk(
    capture: StreamCapture,
    stream: 'stdout' | 'stderr',
    sink: ((chunk: string) => void) | undefined,
    chunk: Buffer
  ): void {
    const decoded = capture.push(chunk)
    if (decoded.length === 0) {
      return
    }
    // Why: a throw from the caller's sink would escape this event handler and crash main.
    try {
      sink?.(decoded)
      if (options.shouldStop?.(decoded, stream) === true) {
        stoppedEarly = true
        finishAfterKill(null)
      }
    } catch (error) {
      finishAfterKill(error instanceof Error ? error : new Error(String(error)))
    }
  }
  function onStdoutData(chunk: Buffer): void {
    handleChunk(out, 'stdout', options.onStdout, chunk)
  }
  function onStderrData(chunk: Buffer): void {
    handleChunk(err, 'stderr', options.onStderr, chunk)
  }
  function onError(error: Error): void {
    finish(-1, error)
  }
  function onClose(code: number | null): void {
    finish(code ?? -1, null)
  }
  function onAbort(): void {
    if (!child.pid) {
      // Why: a failed spawn reports ENOENT after abort cleanup; retain a listener so it cannot crash main.
      child.once('error', () => {})
    }
    finishAfterKill(createAbortError())
  }

  const timer =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          finishAfterKill(null)
        }, options.timeoutMs)
      : undefined

  child.stdout?.on('data', onStdoutData)
  child.stderr?.on('data', onStderrData)
  child.on('error', onError)
  child.on('close', onClose)
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.stdin !== undefined) {
    // Why: a child that exits before draining stdin makes the write fail with EPIPE.
    child.stdin?.on('error', () => {})
    child.stdin?.end(options.stdin)
  }
  return promise
}
