import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Sidecar from './bots-sidecar'

class FakeProc extends EventEmitter {
  pid = 4242
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  postMessage = vi.fn()
  kill = vi.fn(() => {
    queueMicrotask(() => this.emit('exit', 0))
    return true
  })
}

const mocks = vi.hoisted(() => ({
  procs: [] as FakeProc[],
  resources: {
    root: '/res/muster-bots',
    entry: '/res/muster-bots/server/desktop-entry.mjs',
    uiDir: '/res/muster-bots/ui',
    skillsDir: '/res/muster-bots/skills'
  } as Record<string, string> | null,
  waitForBotsServer: vi.fn(async () => {}),
  fork: vi.fn(),
  writeCredentials: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/user-data', getVersion: () => '1.2.3' },
  utilityProcess: { fork: mocks.fork }
}))
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  statSync: () => {
    throw new Error('ENOENT')
  },
  createWriteStream: () => ({ write: vi.fn(), end: vi.fn(), on: vi.fn() })
}))
vi.mock('./bots-resources', () => ({ resolveBotsResources: () => mocks.resources }))
vi.mock('./bots-sidecar-port', () => ({
  pickBotsPort: async () => 18899,
  waitForBotsServer: mocks.waitForBotsServer
}))
vi.mock('./bots-agent-env', () => ({ buildBotsAgentEnv: async () => ({ PATH: '/bin' }) }))
vi.mock('./bots-own-listeners', () => ({ reportBotsOwnListeners: vi.fn() }))
vi.mock('./bots-credentials', () => ({
  readBotsCredentialEnv: () => ({ COMPOSIO_API_KEY: 'ak_saved' }),
  writeBotsCredentialEnv: mocks.writeCredentials
}))

async function loadSidecar(): Promise<typeof Sidecar> {
  vi.resetModules()
  return import('./bots-sidecar')
}

beforeEach(() => {
  mocks.procs.length = 0
  mocks.resources = {
    root: '/res/muster-bots',
    entry: '/res/muster-bots/server/desktop-entry.mjs',
    uiDir: '/res/muster-bots/ui',
    skillsDir: '/res/muster-bots/skills'
  }
  mocks.waitForBotsServer.mockReset()
  mocks.waitForBotsServer.mockResolvedValue(undefined)
  mocks.writeCredentials.mockReset()
  mocks.fork.mockReset()
  mocks.fork.mockImplementation(() => {
    const proc = new FakeProc()
    mocks.procs.push(proc)
    queueMicrotask(() => proc.emit('spawn'))
    return proc
  })
})

describe('bots sidecar', () => {
  it('reports missing when the build has no bots server', async () => {
    mocks.resources = null
    const sidecar = await loadSidecar()
    expect(await sidecar.startBotsSidecar()).toEqual({ state: 'missing' })
    expect(mocks.fork).not.toHaveBeenCalled()
  })

  it('starts once, hands over the owner token and reports the url', async () => {
    const sidecar = await loadSidecar()
    const [first, second] = await Promise.all([
      sidecar.startBotsSidecar(),
      sidecar.startBotsSidecar()
    ])
    expect(mocks.fork).toHaveBeenCalledTimes(1)
    expect(first).toEqual({
      state: 'running',
      url: 'http://127.0.0.1:18899/?embed=muster',
      partition: 'persist:muster-bots'
    })
    expect(second).toEqual(first)

    const [entry, , options] = mocks.fork.mock.calls[0]
    expect(entry).toBe('/res/muster-bots/server/desktop-entry.mjs')
    expect(options.env).toMatchObject({
      PATH: '/bin',
      COMPOSIO_API_KEY: 'ak_saved',
      OMB_MUSTER_SECRET_SINK: '1',
      OMB_DESKTOP_PARENT: '1',
      OMB_PORT: '18899',
      OMB_DATA_DIR: '/user-data/bots',
      OMB_STATIC_DIR: '/res/muster-bots/ui'
    })

    const owner = sidecar.botsOwnerCapability()
    expect(owner?.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mocks.procs[0].postMessage).toHaveBeenCalledWith({
      type: 'openmausbot:desktop-mutation-token',
      token: owner?.token
    })
  })

  it('stores keys the server reports from its own settings, and nothing else', async () => {
    const sidecar = await loadSidecar()
    await sidecar.startBotsSidecar()
    mocks.procs[0].emit('message', {
      type: 'muster:credentials',
      env: { COMPOSIO_API_KEY: 'ak_new' }
    })
    mocks.procs[0].emit('message', { type: 'openmausbot:other', env: { COMPOSIO_API_KEY: 'x' } })
    mocks.procs[0].emit('message', null)
    expect(mocks.writeCredentials).toHaveBeenCalledTimes(1)
    expect(mocks.writeCredentials).toHaveBeenCalledWith({ COMPOSIO_API_KEY: 'ak_new' })
  })

  it('stores a key only after the server accepts it, starting the server to ask', async () => {
    const sidecar = await loadSidecar()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Composio rejected this key' }), { status: 400 })
      )
    await expect(
      sidecar.setBotsCredential('COMPOSIO_API_KEY', { composio: { apiKey: 'ak_bad' } }, 'ak_bad')
    ).rejects.toThrow('Composio rejected this key')
    expect(sidecar.getBotsSidecarStatus().state).toBe('running')
    expect(mocks.writeCredentials).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://127.0.0.1:18899/api/config?secretStorage=external')
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['X-OpenMausBot-Desktop-Owner']).toMatch(/^[A-Za-z0-9_-]{43}$/)

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sidecar.setBotsCredential(
      'COMPOSIO_API_KEY',
      { composio: { apiKey: 'ak_good' } },
      'ak_good'
    )
    expect(mocks.writeCredentials).toHaveBeenCalledWith({ COMPOSIO_API_KEY: 'ak_good' })
    fetchMock.mockRestore()
  })

  it('restarts after a crash and stops cleanly on request', async () => {
    const sidecar = await loadSidecar()
    await sidecar.startBotsSidecar()
    mocks.procs[0].emit('exit', 1)
    await vi.waitFor(() => expect(sidecar.getBotsSidecarStatus().state).toBe('running'))
    expect(mocks.fork).toHaveBeenCalledTimes(2)

    await sidecar.stopBotsSidecar()
    expect(mocks.procs[1].kill).toHaveBeenCalled()
    expect(sidecar.getBotsSidecarStatus()).toEqual({ state: 'stopped' })
    expect(sidecar.botsOwnerCapability()).toBeNull()
    expect(mocks.fork).toHaveBeenCalledTimes(2)
  })

  it('fails and kills the child when the server never answers', async () => {
    mocks.waitForBotsServer.mockRejectedValue(new Error('did not start'))
    const sidecar = await loadSidecar()
    const status = await sidecar.startBotsSidecar()
    expect(status.state).toBe('failed')
    expect(status.state === 'failed' && status.error).toContain('did not start')
    expect(mocks.procs[0].kill).toHaveBeenCalled()
    expect(sidecar.botsOwnerCapability()).toBeNull()
  })
})
