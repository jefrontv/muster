import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SiteWriteBridgeServer,
  siteWriteBridgeFile,
  type SiteWriteBridgeEndpoint
} from './site-write-bridge-server'
import type { SiteSetupApprovalInput } from '../../shared/site-setup-approval-types'

const servers: SiteWriteBridgeServer[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function start(): Promise<{
  call: (path: string, body: unknown) => Promise<Response>
  seen: SiteSetupApprovalInput[]
  waits: { requestId: string; waitMs: number }[]
}> {
  const userDataPath = mkdtempSync(join(tmpdir(), 'muster-approval-'))
  dirs.push(userDataPath)
  const seen: SiteSetupApprovalInput[] = []
  const waits: { requestId: string; waitMs: number }[] = []
  const server = new SiteWriteBridgeServer()
  servers.push(server)
  await server.start({
    store: { updateSite: () => null, getSite: () => null },
    userDataPath,
    onSetupApprovalRequested: (input) => {
      seen.push(input)
      return { requestId: 'approval-1', decision: null }
    },
    onSetupApprovalCollect: async (requestId, waitMs) => {
      waits.push({ requestId, waitMs })
      return { status: 'settled' as const, decision: 'denied' as const }
    },
    onSetupRead: async (op, args) => {
      if (args.provider === 'gitlab') {
        throw new TypeError('provider must be "bitbucket" or "github"')
      }
      return { op, args }
    }
  })
  const endpoint = JSON.parse(
    readFileSync(siteWriteBridgeFile(userDataPath), 'utf-8')
  ) as SiteWriteBridgeEndpoint
  const call = (path: string, body: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${endpoint.port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-muster-site-bridge-token': endpoint.token },
      body: JSON.stringify(body)
    })
  return { call, seen, waits }
}

describe('setup approval routes', () => {
  it('opens a request and hands back its id', async () => {
    const { call, seen } = await start()
    const response = await call('/approval/request', {
      action: 'configure_site',
      title: 'Configure acme',
      summary: 'Set the SSH host',
      details: [{ label: 'Host', value: 'acme.example.com' }],
      siteId: 's1',
      siteName: 'acme',
      agent: 'muster-bots'
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ requestId: 'approval-1', decision: null })
    expect(seen[0]).toMatchObject({ action: 'configure_site', siteId: 's1' })
  })

  it('refuses a request with nothing to show the user', async () => {
    const { call, seen } = await start()
    const response = await call('/approval/request', { action: 'configure_site' })
    expect(response.status).toBe(400)
    expect(seen).toEqual([])
  })

  it('passes the id and wait through on collect', async () => {
    const { call, waits } = await start()
    const response = await call('/approval/collect', { requestId: 'approval-1', waitMs: 2_000 })
    expect(await response.json()).toEqual({ status: 'settled', decision: 'denied' })
    expect(waits).toEqual([{ requestId: 'approval-1', waitMs: 2_000 }])
  })

  it('refuses a collect with no id', async () => {
    const { call } = await start()
    expect((await call('/approval/collect', {})).status).toBe(400)
  })
})

describe('setup read route', () => {
  it('answers a known lookup with its value', async () => {
    const { call } = await start()
    const response = await call('/setup/read', { op: 'projects', args: { query: 'x' } })
    expect(await response.json()).toEqual({ value: { op: 'projects', args: { query: 'x' } } })
  })

  it('refuses an unknown lookup', async () => {
    const { call } = await start()
    expect((await call('/setup/read', { op: 'secrets' })).status).toBe(400)
  })

  it('reports a bad argument as a 400 with the reason', async () => {
    const { call } = await start()
    const response = await call('/setup/read', {
      op: 'clone-sources',
      args: { provider: 'gitlab' }
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'provider must be "bitbucket" or "github"' })
  })
})
