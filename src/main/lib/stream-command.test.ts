// These are integration tests against real subprocesses, POSIX signals and process groups —
// the behaviour under test IS the operating system, so fake timers cannot drive it. Every wait
// here is on an actual event (first stdout chunk, child exit, promise settle); the only real
// durations are the deadlines handed to streamCommand itself, and the liveness poll below,
// which exists because a foreign pid emits no event when it dies.

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { streamCommand } from './stream-command'

const POSIX = process.platform !== 'win32'
/** `sleep` is the grandchild; the shell prints its pid and then blocks. */
const SHELL_WITH_GRANDCHILD = 'sleep 30 & echo $!; wait'

function nodeScript(source: string): string[] {
  return ['-e', source]
}

async function waitUntilDead(pid: number, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    // A 10 ms tick rather than setImmediate: busy-spinning the whole budget would starve the
    // very reaper we are waiting on.
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return false
}

function waitForExit(child: ChildProcess): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  child.once('exit', () => resolve())
  return promise
}

/** Resolves with the grandchild pid the shell fixture prints on its first stdout chunk. */
function grandchildPidGate(): {
  onStdout: (chunk: string) => void
  pid: Promise<number>
} {
  const { promise, resolve } = Promise.withResolvers<number>()
  return {
    onStdout: (chunk) => resolve(Number.parseInt(chunk.trim(), 10)),
    pid: promise
  }
}

describe('streamCommand capture', () => {
  it('captures stdout and stderr separately and reports the exit code', async () => {
    const result = await streamCommand(
      process.execPath,
      nodeScript(`process.stdout.write('out-payload');process.stderr.write('err-payload')`)
    )
    expect(result.stdout).toBe('out-payload')
    expect(result.stderr).toBe('err-payload')
    expect(result.code).toBe(0)
    expect(result.timedOut).toBe(false)
    expect(result.truncated).toBe(false)
    expect(result.stoppedEarly).toBe(false)
  })

  it('streams chunks to the sinks as they arrive', async () => {
    const seen: string[] = []
    const result = await streamCommand(
      process.execPath,
      nodeScript(`process.stdout.write('a');setImmediate(()=>process.stdout.write('b'))`),
      { onStdout: (chunk) => seen.push(chunk) }
    )
    expect(seen.join('')).toBe('ab')
    expect(result.stdout).toBe('ab')
  })

  it('resolves rather than rejecting on a nonzero exit', async () => {
    const result = await streamCommand(process.execPath, nodeScript('process.exit(3)'))
    expect(result.code).toBe(3)
  })

  it('decodes multibyte output split across chunk boundaries', async () => {
    // 200k euro signs is 600 KB, far past the 64 KB pipe chunk, so boundaries land mid-character.
    const result = await streamCommand(
      process.execPath,
      nodeScript(`process.stdout.write('\\u20AC'.repeat(200000))`)
    )
    expect(result.stdout).not.toContain('\uFFFD')
    expect(result.stdout.length).toBe(200_000)
  })

  it('writes stdin and closes it', async () => {
    const result = await streamCommand(
      process.execPath,
      nodeScript('process.stdin.pipe(process.stdout)'),
      { stdin: 'piped-input' }
    )
    expect(result.stdout).toBe('piped-input')
    expect(result.code).toBe(0)
  })

  it('rejects when the binary does not exist', async () => {
    await expect(streamCommand('muster-definitely-not-a-real-binary', [])).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })
})

describe('streamCommand output bounding', () => {
  it('stops growing the capture at maxBytes but keeps streaming and running', async () => {
    const streamed: string[] = []
    const result = await streamCommand(
      process.execPath,
      nodeScript(`process.stdout.write('x'.repeat(300000))`),
      { maxBytes: 1024, onStdout: (chunk) => streamed.push(chunk) }
    )
    expect(result.truncated).toBe(true)
    expect(result.stdout.length).toBeLessThan(300_000)
    // The child ran to completion; only the buffer was bounded.
    expect(result.code).toBe(0)
    expect(streamed.join('').length).toBe(300_000)
  })

  it('bounds stderr independently of stdout', async () => {
    const result = await streamCommand(
      process.execPath,
      nodeScript(`process.stdout.write('ok');process.stderr.write('y'.repeat(300000))`),
      { maxBytes: 1024 }
    )
    expect(result.stdout).toBe('ok')
    expect(result.truncated).toBe(true)
  })
})

describe('streamCommand abort', () => {
  it('rejects with an AbortError when the signal is already aborted', async () => {
    await expect(
      streamCommand(process.execPath, nodeScript('setInterval(()=>{},1000)'), {
        signal: AbortSignal.abort()
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('kills the child and rejects when aborted mid-run', async () => {
    const controller = new AbortController()
    const { promise: startedUp, resolve: markStarted } = Promise.withResolvers<void>()
    const pending = streamCommand(
      process.execPath,
      nodeScript(`process.stdout.write('up');setInterval(()=>{},1000)`),
      { signal: controller.signal, onStdout: () => markStarted() }
    )
    await startedUp
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('streamCommand timeout', () => {
  // Real timers are required here: the deadline is enforced against a real spawned child, and
  // fake timers cannot drive another process's clock. The race is removed instead of padded —
  // rather than guessing that the child wrote before the deadline, the test asserts that whatever
  // the stream callback observed is exactly what survives into the result.
  it('resolves with timedOut when its own deadline elapses', async () => {
    let streamed = ''
    const result = await streamCommand(
      process.execPath,
      nodeScript(`process.stderr.write('partial');setInterval(()=>{},1000)`),
      {
        timeoutMs: 200,
        onStderr: (chunk) => {
          streamed += chunk
        }
      }
    )
    expect(result.timedOut).toBe(true)
    expect(result.code).toBe(-1)
    // Output captured before the deadline survives, so callers can report why it hung.
    expect(result.stderr).toBe(streamed)
    expect(['', 'partial']).toContain(result.stderr)
  })

  it('does not fire when the command finishes first', async () => {
    const result = await streamCommand(process.execPath, nodeScript(`process.stdout.write('q')`), {
      timeoutMs: 60_000
    })
    expect(result.timedOut).toBe(false)
    expect(result.code).toBe(0)
  })
})

describe('streamCommand early stop', () => {
  it('kills the tree and resolves once shouldStop matches', async () => {
    const result = await streamCommand(
      process.execPath,
      nodeScript(`setInterval(()=>process.stdout.write('tick\\n'),5)`),
      { shouldStop: (chunk) => chunk.includes('tick') }
    )
    expect(result.stoppedEarly).toBe(true)
    expect(result.code).toBe(-1)
    expect(result.stdout).toContain('tick')
  })

  it('rejects when the stdout sink throws instead of crashing the process', async () => {
    await expect(
      streamCommand(process.execPath, nodeScript(`process.stdout.write('boom')`), {
        onStdout: () => {
          throw new Error('sink exploded')
        }
      })
    ).rejects.toThrow('sink exploded')
  })
})

// The bug this module exists to fix: a bare child.kill() signals only the direct child, so ssh,
// mysqldump and npm survive a cancel. streamCommand spawns detached and kills the process group.
describe.skipIf(!POSIX)('streamCommand process-group cancellation', () => {
  it('kills a grandchild spawned by the shell it started', async () => {
    const controller = new AbortController()
    const gate = grandchildPidGate()
    const pending = streamCommand('/bin/sh', ['-c', SHELL_WITH_GRANDCHILD], {
      signal: controller.signal,
      onStdout: gate.onStdout
    })
    const grandchildPid = await gate.pid
    expect(grandchildPid).toBeGreaterThan(0)
    expect(() => process.kill(grandchildPid, 0)).not.toThrow()

    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    expect(await waitUntilDead(grandchildPid)).toBe(true)
  })

  it('kills a grandchild when the deadline elapses', async () => {
    const gate = grandchildPidGate()
    const result = await streamCommand('/bin/sh', ['-c', SHELL_WITH_GRANDCHILD], {
      timeoutMs: 200,
      onStdout: gate.onStdout
    })
    expect(result.timedOut).toBe(true)
    const grandchildPid = await gate.pid
    expect(await waitUntilDead(grandchildPid)).toBe(true)
  })

  // Control case: proves the assertions above are load-bearing, not trivially true.
  it('regression guard: a bare child.kill() leaves the grandchild alive', async () => {
    const child = spawn('/bin/sh', ['-c', SHELL_WITH_GRANDCHILD], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const { promise: pidPromise, resolve: resolvePid } = Promise.withResolvers<number>()
    child.stdout.on('data', (chunk: Buffer) => {
      resolvePid(Number.parseInt(chunk.toString('utf8').trim(), 10))
    })
    const grandchildPid = await pidPromise
    try {
      child.kill()
      await waitForExit(child)
      expect(() => process.kill(grandchildPid, 0)).not.toThrow()
    } finally {
      try {
        process.kill(grandchildPid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
  })
})
