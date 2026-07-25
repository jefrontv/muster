import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientChannel, SFTPWrapper } from 'ssh2'

import { createSessionOverTransport, createSiteSshSession } from './site-ssh-session'
import type { SiteSshTransport } from './site-ssh-session'
import { DEFAULT_SITE_EXEC_TIMEOUT_MS } from './site-ssh-exec'
import {
  SiteRunCancelledError,
  SiteRunStepError,
  type SiteRunConfig,
  type SiteSshSession
} from './pipeline-contract'
import { createEmptySiteEnvironment, type Site } from '../../shared/site-types'

/** Lets the awaited chain inside the session advance without touching the faked setTimeout. */
function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setImmediate(resolve)
  return promise
}

class FakeStderr extends EventEmitter {
  resumed = 0
  resume(): this {
    this.resumed += 1
    return this
  }
}

class FakeChannel extends EventEmitter {
  readonly stderr = new FakeStderr()
  closeCalls = 0
  close(): void {
    this.closeCalls += 1
  }
  resume(): this {
    return this
  }
  asChannel(): ClientChannel {
    return this as unknown as ClientChannel
  }
}

type SftpCallback = (error?: Error | null) => void

type FastGetOptions = { step?: (transferred: number, chunk: number, total: number) => void }

/** Narrows a rejection to a SiteRunStepError so the step can be asserted without a cast. */
function expectStepError(error: unknown, step: string): SiteRunStepError {
  if (!(error instanceof SiteRunStepError)) {
    throw new Error(`Expected a SiteRunStepError, received: ${String(error)}`)
  }
  expect(error.step).toBe(step)
  return error
}

type FastGetCall = { source: string; destination: string; hasStep: boolean }

type FakeSftpState = {
  fastGetCalls: FastGetCall[]
  writes: { path: string; contents: string; mode: number | undefined }[]
  chmods: { path: string; mode: number }[]
  unlinked: string[]
  endCalls: number
}

type FakeSftpOptions = {
  downloadSteps?: readonly [number, number][]
  /** Withhold the fastGet callback until end() is called, as a real channel teardown does. */
  holdDownload?: boolean
  unlinkError?: Error
  writeError?: Error
}

function createFakeSftp(options: FakeSftpOptions = {}): {
  sftp: SFTPWrapper
  state: FakeSftpState
} {
  const state: FakeSftpState = {
    fastGetCalls: [],
    writes: [],
    chmods: [],
    unlinked: [],
    endCalls: 0
  }
  let heldDownload: SftpCallback | undefined
  const sftp = {
    fastGet: (
      source: string,
      destination: string,
      optionsOrCallback: FastGetOptions | SftpCallback,
      maybeCallback?: SftpCallback
    ): void => {
      const passedOptions = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      const step = passedOptions?.step
      state.fastGetCalls.push({ source, destination, hasStep: typeof step === 'function' })
      for (const [transferred, total] of options.downloadSteps ?? []) {
        step?.(transferred, 0, total)
      }
      if (options.holdDownload) {
        heldDownload = callback
        return
      }
      callback?.()
    },
    writeFile: (
      path: string,
      contents: string,
      writeOptions: { mode?: number },
      callback: (error?: Error | null) => void
    ): void => {
      if (options.writeError) {
        callback(options.writeError)
        return
      }
      state.writes.push({ path, contents, mode: writeOptions.mode })
      callback(null)
    },
    chmod: (path: string, mode: number, callback: (error?: Error | null) => void): void => {
      state.chmods.push({ path, mode })
      callback(null)
    },
    unlink: (path: string, callback: (error?: Error | null) => void): void => {
      state.unlinked.push(path)
      callback(options.unlinkError ?? null)
    },
    createWriteStream: () =>
      new Writable({
        write: (_chunk, _encoding, callback) => callback()
      }),
    end: (): void => {
      state.endCalls += 1
      const held = heldDownload
      heldDownload = undefined
      held?.(new Error('SFTP channel closed'))
    }
  } as unknown as SFTPWrapper
  return { sftp, state }
}

function createTransport(
  channel: FakeChannel,
  sftp?: SFTPWrapper
): { transport: SiteSshTransport; disconnects: () => number } {
  let disconnects = 0
  const transport: SiteSshTransport = {
    exec: async () => channel.asChannel(),
    sftp: async () => {
      if (!sftp) {
        throw new Error('no sftp configured')
      }
      return sftp
    },
    disconnect: async () => {
      disconnects += 1
    }
  }
  return { transport, disconnects: () => disconnects }
}

function createSession(
  channel: FakeChannel,
  sftp?: SFTPWrapper
): { session: SiteSshSession; controller: AbortController; disconnects: () => number } {
  const controller = new AbortController()
  const { transport, disconnects } = createTransport(channel, sftp)
  return {
    session: createSessionOverTransport(transport, controller.signal),
    controller,
    disconnects
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('site SSH session exec', () => {
  it('resolves a non-zero exit instead of throwing, so the caller decides', async () => {
    const channel = new FakeChannel()
    const { session } = createSession(channel)

    const result = session.exec('wp core version')
    await flush()
    channel.stderr.emit('data', Buffer.from('bash: wp: command not found\n'))
    channel.emit('close', 127)

    await expect(result).resolves.toEqual({
      code: 127,
      stdout: '',
      stderr: 'bash: wp: command not found\n'
    })
  })

  it('streams stdout and stderr while still returning the buffered copy', async () => {
    const channel = new FakeChannel()
    const { session } = createSession(channel)
    const out: string[] = []
    const err: string[] = []

    const result = session.exec('mysqldump acme', {
      onStdout: (c) => out.push(c),
      onStderr: (c) => err.push(c)
    })
    await flush()
    channel.emit('data', Buffer.from('-- dump start\n'))
    channel.emit('data', Buffer.from('-- dump end\n'))
    channel.stderr.emit('data', Buffer.from('Warning: using a password\n'))
    channel.emit('close', 0)

    await expect(result).resolves.toMatchObject({
      code: 0,
      stdout: '-- dump start\n-- dump end\n'
    })
    expect(out).toEqual(['-- dump start\n', '-- dump end\n'])
    expect(err).toEqual(['Warning: using a password\n'])
  })

  it('arms no timer for timeoutMs 0 so a long mysqldump is never cut off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const channel = new FakeChannel()
    const { session } = createSession(channel)

    const result = session.exec('mysqldump acme | gzip > dump.gz', { timeoutMs: 0 })
    await flush()

    expect(vi.getTimerCount()).toBe(0)

    channel.emit('close', 0)
    await expect(result).resolves.toMatchObject({ code: 0 })
  })

  it('arms exactly one timer when a timeout is in force', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const channel = new FakeChannel()
    const { session } = createSession(channel)

    const result = session.exec('wp cron event run --due-now')
    await flush()

    expect(vi.getTimerCount()).toBe(1)

    channel.emit('close', 0)
    await expect(result).resolves.toMatchObject({ code: 0 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fails with a step error once the timeout elapses', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const channel = new FakeChannel()
    const { session } = createSession(channel)

    const result = session.exec('wp search-replace old new')
    const settled = result.catch((error: unknown) => error)
    await flush()

    vi.advanceTimersByTime(DEFAULT_SITE_EXEC_TIMEOUT_MS)
    expect(channel.closeCalls).toBe(1)
    channel.emit('close', null)

    const error = expectStepError(await settled, 'ssh-exec')
    expect(error.message).toContain('timed out after 600s')
  })

  it('closes the channel and waits for its close before settling an abort', async () => {
    const channel = new FakeChannel()
    const { session, controller } = createSession(channel)

    const result = session.exec('tail -f error_log')
    const settled = result.catch((error: unknown) => error)
    let done = false
    void settled.then(() => {
      done = true
    })
    await flush()

    controller.abort()
    await flush()

    // Why: sshd holds the MaxSessions slot until CHANNEL_CLOSE, so the promise must still be
    // pending here — settling early is what makes the next exec get refused.
    expect(channel.closeCalls).toBe(1)
    expect(done).toBe(false)

    channel.emit('close', null)
    expect(await settled).toBeInstanceOf(SiteRunCancelledError)
  })

  it('rejects immediately when the run was already cancelled', async () => {
    const channel = new FakeChannel()
    const { session, controller } = createSession(channel)
    controller.abort()

    await expect(session.exec('true')).rejects.toBeInstanceOf(SiteRunCancelledError)
    expect(channel.closeCalls).toBe(0)
  })
})

describe('site SSH session transfers', () => {
  it('reports monotonically increasing download bytes and ends the channel', async () => {
    const channel = new FakeChannel()
    const { sftp, state } = createFakeSftp({
      downloadSteps: [
        [0, 300],
        [128, 300],
        [300, 300]
      ]
    })
    const { session } = createSession(channel, sftp)
    const seen: number[] = []

    await session.download('/srv/dump.sql.gz', '/tmp/dump.sql.gz', (transferred, total) => {
      expect(total).toBe(300)
      seen.push(transferred)
    })

    expect(seen).toEqual([0, 128, 300])
    expect(seen.every((value, index) => index === 0 || value >= seen[index - 1])).toBe(true)
    expect(state.fastGetCalls).toEqual([
      { source: '/srv/dump.sql.gz', destination: '/tmp/dump.sql.gz', hasStep: true }
    ])
    expect(state.endCalls).toBe(1)
  })

  it('keeps the three-argument fastGet shape when no progress is wanted', async () => {
    const channel = new FakeChannel()
    const { sftp, state } = createFakeSftp()
    const { session } = createSession(channel, sftp)

    await session.download('/srv/dump.sql.gz', '/tmp/dump.sql.gz')

    expect(state.fastGetCalls[0].hasStep).toBe(false)
  })

  it('reports monotonically increasing upload bytes up to the file size', async () => {
    const channel = new FakeChannel()
    const { sftp } = createFakeSftp()
    const { session } = createSession(channel, sftp)
    const directory = await mkdtemp(join(tmpdir(), 'muster-site-upload-'))
    const localPath = join(directory, 'theme.zip')
    const size = 300_000
    await writeFile(localPath, Buffer.alloc(size, 7))
    const seen: number[] = []

    try {
      await session.upload(localPath, '/srv/theme.zip', (transferred, total) => {
        expect(total).toBe(size)
        seen.push(transferred)
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }

    expect(seen.length).toBeGreaterThan(2)
    expect(seen[0]).toBe(0)
    expect(seen.at(-1)).toBe(size)
    expect(seen.every((value, index) => index === 0 || value >= seen[index - 1])).toBe(true)
  })

  it('rejects a transfer as cancelled once the run is aborted', async () => {
    const channel = new FakeChannel()
    const { sftp } = createFakeSftp()
    const { session, controller } = createSession(channel, sftp)
    controller.abort()

    await expect(session.download('/srv/a', '/tmp/a')).rejects.toBeInstanceOf(SiteRunCancelledError)
  })

  it('ends the SFTP channel mid-transfer on abort so the download actually stops', async () => {
    const channel = new FakeChannel()
    const { sftp, state } = createFakeSftp({ holdDownload: true })
    const { session, controller } = createSession(channel, sftp)

    const settled = session
      .download('/srv/dump.sql.gz', '/tmp/dump.sql.gz')
      .catch((error: unknown) => error)
    await flush()
    expect(state.endCalls).toBe(0)

    controller.abort()

    expect(await settled).toBeInstanceOf(SiteRunCancelledError)
    expect(state.endCalls).toBe(1)
  })
})

describe('site SSH session remote files', () => {
  it('writes a credentials file 0600 and chmods it in case the path already existed', async () => {
    const channel = new FakeChannel()
    const { sftp, state } = createFakeSftp()
    const { session } = createSession(channel, sftp)

    await session.writeSecureRemoteFile('/srv/.my.cnf', '[client]\npassword=hunter2\n')

    expect(state.writes).toEqual([
      { path: '/srv/.my.cnf', contents: '[client]\npassword=hunter2\n', mode: 0o600 }
    ])
    expect(state.chmods).toEqual([{ path: '/srv/.my.cnf', mode: 0o600 }])
    expect(state.endCalls).toBe(1)
  })

  it('surfaces a failed secure write instead of leaving the caller to assume success', async () => {
    const channel = new FakeChannel()
    const { sftp } = createFakeSftp({ writeError: new Error('Permission denied') })
    const { session } = createSession(channel, sftp)

    await expect(session.writeSecureRemoteFile('/srv/.my.cnf', 'x')).rejects.toThrow(
      'Permission denied'
    )
  })

  it('swallows a failed delete and still releases the SFTP channel', async () => {
    const channel = new FakeChannel()
    const { sftp, state } = createFakeSftp({ unlinkError: new Error('No such file') })
    const { session } = createSession(channel, sftp)

    await expect(session.removeRemoteFile('/srv/.my.cnf')).resolves.toBeUndefined()
    expect(state.unlinked).toEqual(['/srv/.my.cnf'])
    expect(state.endCalls).toBe(1)
  })

  it('still deletes a credentials file after the run was cancelled', async () => {
    const channel = new FakeChannel()
    const { sftp, state } = createFakeSftp()
    const { session, controller } = createSession(channel, sftp)
    controller.abort()

    await session.removeRemoteFile('/srv/.my.cnf')

    expect(state.unlinked).toEqual(['/srv/.my.cnf'])
  })

  it('disconnects the transport on close', async () => {
    const channel = new FakeChannel()
    const { session, disconnects } = createSession(channel)

    await session.close()

    expect(disconnects()).toBe(1)
  })
})

describe('createSiteSshSession', () => {
  it('refuses to open a connection when the environment has no host or user', async () => {
    const error = await createSiteSshSession(
      createConfig({ hostname: '', username: 'deploy' }),
      new AbortController().signal
    ).catch((err: unknown) => err)

    const stepError = expectStepError(error, 'ssh-connect')
    expect(stepError.message).toContain('missing an SSH hostname or username')
  })

  it('rejects before any socket work when the run is already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(createSiteSshSession(createConfig(), controller.signal)).rejects.toBeInstanceOf(
      SiteRunCancelledError
    )
  })
})

function createConfig(overrides: { hostname?: string; username?: string } = {}): SiteRunConfig {
  const environment = {
    ...createEmptySiteEnvironment(),
    hostname: overrides.hostname ?? 'acme-web-01.example.com',
    username: overrides.username ?? 'deploy'
  }
  const site: Site = {
    id: 'site-1',
    path: '/Users/dev/Sites/acme',
    repoId: null,
    displayName: 'Acme',
    localWpRoot: '',
    localDomain: 'acme.local',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '8.2',
    activeEnvironment: 'main',
    environments: { main: environment },
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
  return {
    site,
    environmentName: 'main',
    environment,
    group: 'import',
    wpDir: '/Users/dev/Sites/acme',
    sshPassword: 'hunter2',
    dbPassword: 'hunter3'
  }
}
