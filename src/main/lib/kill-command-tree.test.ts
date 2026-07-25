// Integration tests against real POSIX process groups and signal dispositions. Fake timers
// cannot model "a child that ignores SIGTERM", so the only real duration here is the grace
// window handed to killCommandTree itself; every other wait is on an actual process event.

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { killCommandTree } from './kill-command-tree'

const POSIX = process.platform !== 'win32'

function waitForExit(child: ChildProcess): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  if (child.exitCode !== null || child.signalCode !== null) {
    resolve()
    return promise
  }
  child.once('exit', () => resolve())
  return promise
}

/** Resolves once the child prints its readiness marker, so no test guesses at startup time. */
function spawnDetachedNode(source: string): { child: ChildProcess; ready: Promise<string> } {
  const child = spawn(process.execPath, ['-e', source], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  const { promise, resolve } = Promise.withResolvers<string>()
  child.stdout?.on('data', (chunk: Buffer) => resolve(chunk.toString('utf8').trim()))
  return { child, ready: promise }
}

const STAY_ALIVE = `process.stdout.write('ready');setInterval(()=>{},1000)`
const IGNORE_SIGTERM = `process.on('SIGTERM',()=>{});${STAY_ALIVE}`
/** Parent prints the pid of a grandchild it spawned into the same process group. */
const SPAWN_GRANDCHILD = `
const { spawn } = require('node:child_process')
const kid = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' })
process.stdout.write(String(kid.pid))
setInterval(()=>{},1000)
`

describe.skipIf(!POSIX)('killCommandTree', () => {
  it('terminates a cooperative child with SIGTERM, without escalating', async () => {
    const { child, ready } = spawnDetachedNode(STAY_ALIVE)
    await ready
    await killCommandTree(child, { graceMs: 5_000 })
    await waitForExit(child)
    expect(child.signalCode).toBe('SIGTERM')
  })

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    const { child, ready } = spawnDetachedNode(IGNORE_SIGTERM)
    await ready
    await killCommandTree(child, { graceMs: 200 })
    await waitForExit(child)
    expect(child.signalCode).toBe('SIGKILL')
  })

  it('kills a grandchild in the same process group', async () => {
    const { child, ready } = spawnDetachedNode(SPAWN_GRANDCHILD)
    const grandchildPid = Number.parseInt(await ready, 10)
    expect(grandchildPid).toBeGreaterThan(0)
    expect(() => process.kill(grandchildPid, 0)).not.toThrow()

    await killCommandTree(child, { graceMs: 500 })
    await waitForExit(child)
    expect(await isDead(grandchildPid)).toBe(true)
  })

  it('resolves without throwing for an already-dead child', async () => {
    const child = spawn(process.execPath, ['-e', ''], { detached: true, stdio: 'ignore' })
    await waitForExit(child)
    await expect(killCommandTree(child, { graceMs: 50 })).resolves.toBeUndefined()
  })

  it('resolves without throwing for a child that never spawned', async () => {
    const child = spawn('muster-definitely-not-a-real-binary', [], { stdio: 'ignore' })
    child.once('error', () => {})
    await expect(killCommandTree(child, { graceMs: 50 })).resolves.toBeUndefined()
  })

  it('resolves without throwing for a pid that no longer exists', async () => {
    const { child } = spawnDetachedNode(STAY_ALIVE)
    const pid = child.pid ?? 0
    expect(pid).toBeGreaterThan(0)
    // Kill the group out from under it so killCommandTree finds nothing to signal.
    process.kill(-pid, 'SIGKILL')
    await waitForExit(child)
    await expect(killCommandTree(child, { graceMs: 50 })).resolves.toBeUndefined()
  })

  it('falls back to the bare pid for a child that was not spawned detached', async () => {
    const child = spawn(process.execPath, ['-e', STAY_ALIVE], {
      detached: false,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const { promise, resolve } = Promise.withResolvers<void>()
    child.stdout?.once('data', () => resolve())
    await promise
    await killCommandTree(child, { graceMs: 5_000 })
    await waitForExit(child)
    expect(child.signalCode).toBe('SIGTERM')
  })
})

/** Polls because a foreign pid emits no event when it dies. */
async function isDead(pid: number, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return false
}
