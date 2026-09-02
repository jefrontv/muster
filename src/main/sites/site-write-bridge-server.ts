// Lets the site-MCP process apply site writes through the running GUI instead of
// writing orca-data.json behind its back.
//
// Why this exists: the MCP server is a second Electron process with its own Store.
// Its writes landed on disk correctly, but the GUI kept a stale `sites` array in
// memory and serializes the WHOLE state on its next save — so any later GUI action
// silently reverted the agent's edit. Worse, deploys started from the app read the
// GUI's in-memory store, so a correct on-disk toggle still ran with the old value.
// Routing writes to the one process that owns the live state removes both.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Site, SiteCustomStep } from '../../shared/site-types'
import type {
  PlanAnnotationRequest,
  PlanAnnotationResult
} from '../../shared/plan-annotation-types'

/** Discovery file the MCP process reads; absent means "no GUI, write to disk". */
export const SITE_WRITE_BRIDGE_FILE_NAME = 'site-write-bridge.json'

export type SiteWriteBridgeEndpoint = {
  port: number
  token: string
  pid: number
}

export type SiteWriteBridgeStore = {
  updateSite: (siteId: string, updates: Partial<Omit<Site, 'id'>>) => Site | null
  /** Absent on a store that predates the shared step library. */
  setSiteStepLibrary?: (steps: readonly SiteCustomStep[]) => void
}

export function siteWriteBridgeFile(userDataPath: string): string {
  return join(userDataPath, SITE_WRITE_BRIDGE_FILE_NAME)
}

type StartArgs = {
  store: SiteWriteBridgeStore
  userDataPath: string
  /** Called after a successful write so the renderer can re-read the site. */
  onSiteChanged?: (site: Site) => void
  /** Parks the HTTP response until a person has reviewed the plan. Absent = feature off. */
  onPlanAnnotationRequested?: (
    request: Omit<PlanAnnotationRequest, 'requestId'>
  ) => Promise<PlanAnnotationResult>
}

export class SiteWriteBridgeServer {
  private server: Server | null = null
  private token = ''
  private endpointFile = ''

  async start(args: StartArgs): Promise<void> {
    if (this.server) {
      return
    }
    this.token = randomBytes(32).toString('hex')
    this.server = createServer((req, res) => {
      void this.handle(req, res, args)
    })
    // Loopback only: this applies writes with no user prompt, so it must never be
    // reachable off the machine.
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(0, '127.0.0.1', () => resolve())
    })
    // Why unref: a bridge with no in-flight request must not hold the app open.
    this.server.unref()
    // Why: Node defaults requestTimeout to 300s, which would guillotine a plan review mid-read.
    // The deadline belongs to the review queue (PLAN_ANNOTATION_TIMEOUT_MS), where it is visible.
    this.server.requestTimeout = 0
    const address = this.server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    if (port <= 0) {
      await this.stop()
      throw new Error('site write bridge could not bind a loopback port')
    }
    this.endpointFile = siteWriteBridgeFile(args.userDataPath)
    mkdirSync(dirname(this.endpointFile), { recursive: true })
    const endpoint: SiteWriteBridgeEndpoint = { port, token: this.token, pid: process.pid }
    writeFileSync(this.endpointFile, JSON.stringify(endpoint), { encoding: 'utf-8', mode: 0o600 })
  }

  private async handle(req: IncomingMessage, res: ServerResponse, args: StartArgs): Promise<void> {
    const reply = (status: number, payload: unknown): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    const isSiteUpdate = req.method === 'POST' && req.url === '/site/update'
    const isLibraryUpdate = req.method === 'POST' && req.url === '/library/update'
    const isPlanAnnotate = req.method === 'POST' && req.url === '/plan/annotate'
    if (!isSiteUpdate && !isLibraryUpdate && !isPlanAnnotate) {
      reply(404, { error: 'not found' })
      return
    }
    if (req.headers['x-muster-site-bridge-token'] !== this.token) {
      reply(401, { error: 'unauthorized' })
      return
    }
    if (isPlanAnnotate) {
      try {
        const body = await readJsonBody(req)
        const content = typeof body.content === 'string' ? body.content : ''
        if (content.length === 0) {
          reply(400, { error: 'content is required' })
          return
        }
        const ask = args.onPlanAnnotationRequested
        if (!ask) {
          reply(404, { error: 'this build cannot review plans' })
          return
        }
        // Deliberately not replied to yet: this response is parked until a person decides, which
        // is the whole point of the route. The queue owns the deadline.
        const result = await ask({
          planPath: typeof body.planPath === 'string' ? body.planPath : null,
          title: typeof body.title === 'string' ? body.title : 'Plan',
          content,
          round: typeof body.round === 'number' ? body.round : 1,
          agent: typeof body.agent === 'string' ? body.agent : null,
          project: typeof body.project === 'string' ? body.project : null,
          previousContent: typeof body.previousContent === 'string' ? body.previousContent : null
        })
        reply(200, result)
      } catch (error) {
        reply(500, { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }
    if (isLibraryUpdate) {
      try {
        const body = await readJsonBody(req)
        if (!Array.isArray(body.steps)) {
          reply(400, { error: 'steps must be an array' })
          return
        }
        const write = args.store.setSiteStepLibrary
        if (!write) {
          reply(404, { error: 'this build cannot write the step library' })
          return
        }
        write(body.steps as SiteCustomStep[])
        reply(200, { ok: true })
      } catch (error) {
        reply(500, { error: error instanceof Error ? error.message : String(error) })
      }
      return
    }
    try {
      const body = await readJsonBody(req)
      const siteId = typeof body.siteId === 'string' ? body.siteId : ''
      const updates = (body.updates ?? {}) as Partial<Omit<Site, 'id'>>
      if (siteId === '') {
        reply(400, { error: 'siteId is required' })
        return
      }
      const site = args.store.updateSite(siteId, updates)
      if (!site) {
        // Not an error the caller can fix by retrying here: fall back to its own write.
        reply(404, { error: `no site with id ${siteId}` })
        return
      }
      args.onSiteChanged?.(site)
      reply(200, { site })
    } catch (error) {
      reply(500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  async stop(): Promise<void> {
    if (this.endpointFile) {
      rmSync(this.endpointFile, { force: true })
      this.endpointFile = ''
    }
    const server = this.server
    this.server = null
    this.token = ''
    if (!server) {
      return
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
}

export const siteWriteBridgeServer = new SiteWriteBridgeServer()
