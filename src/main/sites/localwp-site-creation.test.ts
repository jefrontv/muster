import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLocalWpHost, type LocalWpCommandResult, type LocalWpHost } from './localwp-host'
import { addLocalWpSite, type AddLocalWpSiteRequest } from './localwp-site-creation'

const HOME = '/Users/tester'
const SUPPORT = path.join(HOME, 'Library', 'Application Support', 'Local')
const SERVICES = path.join(SUPPORT, 'lightning-services')
const SITE_ID = 'aBcD1234'
const ADMIN_PASSWORD = 'adm1n-do-not-log'

function request(): AddLocalWpSiteRequest {
  return {
    domain: 'acme.local',
    name: 'Acme',
    sitePath: '/Sites/acme',
    adminEmail: 'hello@example.com',
    adminPassword: ADMIN_PASSWORD
  }
}

type World = {
  platform?: string
  connectionInfo?: unknown
  openPorts?: number[]
  listenPorts?: number[]
  services?: string[]
}

function fakeHost(world: World = {}): LocalWpHost {
  const connectionPath = path.join(SUPPORT, 'graphql-connection-info.json')
  const lsofOutput = (world.listenPorts ?? [])
    .map((port) => `Local 4711 tester 30u IPv4 0x1 0t0 TCP 127.0.0.1:${port} (LISTEN)`)
    .join('\n')
  return createLocalWpHost({
    platform: world.platform ?? 'darwin',
    homeDir: HOME,
    run: async (file): Promise<LocalWpCommandResult> =>
      file === 'pgrep'
        ? { code: 0, stdout: '4711', stderr: '' }
        : { code: 0, stdout: lsofOutput, stderr: '' },
    readTextFile: async (filePath) =>
      filePath === connectionPath && world.connectionInfo !== undefined
        ? JSON.stringify(world.connectionInfo)
        : null,
    pathExists: async () => false,
    listDirectory: async (dirPath) => (dirPath === SERVICES ? (world.services ?? []) : []),
    canonicalPath: async (filePath) => filePath,
    isTcpPortOpen: async (port) => (world.openPorts ?? []).includes(port),
    isMysqlSocketReady: async () => false,
    sleep: async () => {},
    environment: {}
  })
}

describe('addLocalWpSite', () => {
  it('reports the platform as unsupported off darwin', async () => {
    const result = await addLocalWpSite(request(), { host: fakeHost({ platform: 'linux' }) })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('macOS')
  })

  it('explains that Local must be running when connection info is missing', async () => {
    const result = await addLocalWpSite(request(), { host: fakeHost() })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('connection info not found')
  })

  it('explains which ports were tried when none answer', async () => {
    const host = fakeHost({ connectionInfo: { port: 4999, authToken: 't' }, openPorts: [] })
    const result = await addLocalWpSite(request(), { host })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('4999')
    expect(result.message).toContain('4000')
  })

  it('posts the mutation with the stripped apache service version and returns the site id', async () => {
    const host = fakeHost({
      connectionInfo: { port: 5200, authToken: 'bearer-token' },
      openPorts: [5200],
      services: ['apache-2.4.43+11', 'apache-2.4.39+8']
    })
    const posted: { url: string; authToken: string; body: string }[] = []
    const result = await addLocalWpSite(request(), {
      host,
      post: async (url, authToken, body) => {
        posted.push({ url, authToken, body })
        return { data: { addSite: { error: null, id: SITE_ID, logs: [], status: 'created' } } }
      }
    })
    expect(result).toEqual({ ok: true, siteId: SITE_ID, message: 'LocalWP site created' })
    expect(posted).toHaveLength(1)
    expect(posted[0]?.url).toBe('http://127.0.0.1:5200/graphql')
    expect(posted[0]?.authToken).toBe('bearer-token')
    const input = JSON.parse(posted[0]?.body ?? '{}').variables.AddSiteInput
    expect(input.webServer).toBe('apache-2.4.43')
    expect(input.skipWPInstall).toBe(true)
    expect(input.environment).toBe('custom')
    expect(input.domain).toBe('acme.local')
    expect(input.path).toBe('/Sites/acme')
  })

  it('falls back to a bare apache when no service is installed', async () => {
    const host = fakeHost({ connectionInfo: { port: 4000, authToken: '' }, openPorts: [4000] })
    let body = ''
    await addLocalWpSite(request(), {
      host,
      post: async (_url, _token, requestBody) => {
        body = requestBody
        return { data: { addSite: { id: SITE_ID } } }
      }
    })
    expect(JSON.parse(body).variables.AddSiteInput.webServer).toBe('apache')
  })

  // The stale-connection-info retry is the whole reason the candidate list exists.
  it('retries the next live port when the advertised one refuses the request', async () => {
    const host = fakeHost({
      connectionInfo: { port: 4999, authToken: 't' },
      listenPorts: [5300],
      openPorts: [4999, 5300]
    })
    const attempted: string[] = []
    const statuses: string[] = []
    const result = await addLocalWpSite(request(), {
      host,
      onStatus: (message) => statuses.push(message),
      post: async (url) => {
        attempted.push(url)
        if (url.includes('4999')) {
          throw new Error('ECONNREFUSED')
        }
        return { data: { addSite: { id: SITE_ID } } }
      }
    })
    expect(attempted).toEqual(['http://127.0.0.1:4999/graphql', 'http://127.0.0.1:5300/graphql'])
    expect(result.ok).toBe(true)
    expect(statuses.some((line) => line.includes('trying port 5300'))).toBe(true)
  })

  it('surfaces the last transport error when every port fails', async () => {
    const host = fakeHost({ connectionInfo: { port: 4000, authToken: '' }, openPorts: [4000] })
    const result = await addLocalWpSite(request(), {
      host,
      post: async () => {
        throw new Error('LocalWP API error 500: Internal Server Error')
      }
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('LocalWP API error 500: Internal Server Error')
  })

  it('surfaces graphql errors', async () => {
    const host = fakeHost({ connectionInfo: { port: 4000, authToken: '' }, openPorts: [4000] })
    const result = await addLocalWpSite(request(), {
      host,
      post: async () => ({ errors: [{ message: 'domain already in use' }] })
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('LocalWP GraphQL error: domain already in use')
  })

  it('surfaces an addSite-level error', async () => {
    const host = fakeHost({ connectionInfo: { port: 4000, authToken: '' }, openPorts: [4000] })
    const result = await addLocalWpSite(request(), {
      host,
      post: async () => ({ data: { addSite: { error: 'path is not empty' } } })
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('LocalWP addSite error: path is not empty')
  })

  it('never puts the admin password in a status message or the result', async () => {
    const host = fakeHost({ connectionInfo: { port: 4000, authToken: '' }, openPorts: [4000] })
    const statuses: string[] = []
    const result = await addLocalWpSite(request(), {
      host,
      onStatus: (message) => statuses.push(message),
      post: async () => ({ data: { addSite: { id: SITE_ID } } })
    })
    expect(statuses.join('\n')).not.toContain(ADMIN_PASSWORD)
    expect(JSON.stringify(result)).not.toContain(ADMIN_PASSWORD)
  })
})
