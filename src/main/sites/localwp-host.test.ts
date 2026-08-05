// The MySQL socket probe against real Unix sockets. Faking `net` here would test the mock, and the
// whole point of the probe is what the kernel does when a socket file exists but the server behind
// it is not usable yet.

import net from 'node:net'
import { mkdtemp, rm, chmod } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isMysqlSocketReady } from './localwp-host'

const PROBE_TIMEOUT_MS = 300

const cleanups: (() => Promise<void>)[] = []

async function socketDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'muster-sock-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

/** `greet: false` models the window where mysqld has bound the socket but is still starting. */
async function listeningSocket(greet: boolean): Promise<string> {
  const socketPath = path.join(await socketDirectory(), 'mysqld.sock')
  const server = net.createServer((connection) => {
    if (greet) {
      connection.write('\u0000\u0000\u0000\u0000mysql-handshake')
    }
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())))
  return socketPath
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
})

describe('isMysqlSocketReady', () => {
  it('is ready once the server sends its handshake unprompted', async () => {
    expect(await isMysqlSocketReady(await listeningSocket(true), PROBE_TIMEOUT_MS)).toBe(true)
  })

  it('is not ready while the socket file exists but nothing answers on it', async () => {
    // The exact race the probe exists to close: `pathExists` would already say yes here.
    expect(await isMysqlSocketReady(await listeningSocket(false), PROBE_TIMEOUT_MS)).toBe(false)
  })

  it('is not ready when the socket file is gone', async () => {
    const missing = path.join(await socketDirectory(), 'mysqld.sock')
    expect(await isMysqlSocketReady(missing, PROBE_TIMEOUT_MS)).toBe(false)
  })

  it('assumes ready when it cannot probe at all, as ocsites did without its MySQL client', async () => {
    // A socket this process may not connect to says nothing about whether mysqld is up. Reporting
    // "not ready" would burn the caller's whole 3-minute budget and then blame a timeout.
    const socketPath = await listeningSocket(true)
    await chmod(socketPath, 0o000)
    expect(await isMysqlSocketReady(socketPath, PROBE_TIMEOUT_MS)).toBe(true)
  })
})
