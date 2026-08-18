import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Site } from '../../shared/site-types'
import {
  SiteWriteBridgeServer,
  siteWriteBridgeFile,
  type SiteWriteBridgeEndpoint
} from './site-write-bridge-server'

function site(overrides: Partial<Site> = {}): Site {
  return {
    id: 's1',
    displayName: 'Acme',
    path: '/Sites/acme',
    environments: {},
    activeEnvironment: 'main',
    ...overrides
  } as Site
}

const servers: SiteWriteBridgeServer[] = []
const dirs: string[] = []

function newUserData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'muster-bridge-'))
  dirs.push(dir)
  return dir
}

function readEndpoint(userDataPath: string): SiteWriteBridgeEndpoint {
  return JSON.parse(readFileSync(siteWriteBridgeFile(userDataPath), 'utf-8'))
}

async function post(
  endpoint: SiteWriteBridgeEndpoint,
  body: unknown,
  token = endpoint.token
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${endpoint.port}/site/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-muster-site-bridge-token': token },
    body: JSON.stringify(body)
  })
  return { status: response.status, payload: (await response.json()) as Record<string, unknown> }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function startServer(args: {
  userDataPath: string
  updateSite: (siteId: string, updates: Partial<Omit<Site, 'id'>>) => Site | null
}): Promise<SiteWriteBridgeServer> {
  const server = new SiteWriteBridgeServer()
  servers.push(server)
  await server.start({ store: { updateSite: args.updateSite }, userDataPath: args.userDataPath })
  return server
}

describe('SiteWriteBridgeServer', () => {
  it('applies a write through the store it was given', async () => {
    const userDataPath = newUserData()
    const applied: { siteId: string; updates: unknown }[] = []
    await startServer({
      userDataPath,
      updateSite: (siteId, updates) => {
        applied.push({ siteId, updates })
        return site({ displayName: 'Renamed' })
      }
    })
    const result = await post(readEndpoint(userDataPath), {
      siteId: 's1',
      updates: { displayName: 'Renamed' }
    })
    expect(result.status).toBe(200)
    expect((result.payload.site as Site).displayName).toBe('Renamed')
    expect(applied).toEqual([{ siteId: 's1', updates: { displayName: 'Renamed' } }])
  })

  it('refuses a request without the endpoint token', async () => {
    const userDataPath = newUserData()
    let called = false
    await startServer({
      userDataPath,
      updateSite: () => {
        called = true
        return site()
      }
    })
    // The bridge applies writes with no prompt, so an unauthenticated caller must not reach it.
    const result = await post(readEndpoint(userDataPath), { siteId: 's1', updates: {} }, 'wrong')
    expect(result.status).toBe(401)
    expect(called).toBe(false)
  })

  it('reports an unknown site rather than claiming success', async () => {
    const userDataPath = newUserData()
    await startServer({ userDataPath, updateSite: () => null })
    const result = await post(readEndpoint(userDataPath), { siteId: 'missing', updates: {} })
    expect(result.status).toBe(404)
  })

  it('removes the endpoint file on stop so a later client does not post to a dead port', async () => {
    const userDataPath = newUserData()
    const server = await startServer({ userDataPath, updateSite: () => site() })
    expect(existsSync(siteWriteBridgeFile(userDataPath))).toBe(true)
    await server.stop()
    expect(existsSync(siteWriteBridgeFile(userDataPath))).toBe(false)
  })
})
