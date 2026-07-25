import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteRunEvent, SiteRunProgressEvent } from '../../shared/site-run-types'
import { SiteRunCancelledError, type SiteRunContext } from './pipeline-contract'
import { createSiteRunService, type SiteRunJob, type SiteRunService } from './site-run-service'

let baseDir = ''
let events: SiteRunEvent[] = []

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'muster-run-service-'))
  events = []
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(baseDir, { recursive: true, force: true })
})

function makeService(): SiteRunService {
  return createSiteRunService({ baseDir, emit: (event) => events.push(event) })
}

function startRun(service: SiteRunService, job: SiteRunJob): { runId: string; siteId: string } {
  const run = service.start({
    siteId: 'site-1',
    siteName: 'Acme',
    group: 'import',
    environment: 'main',
    branch: 'main',
    job
  })
  return { runId: run.id, siteId: run.siteId }
}

/** Starts a run that parks inside the job, handing the test its live context. */
function startParkedRun(service: SiteRunService): {
  runId: string
  siteId: string
  context: Promise<SiteRunContext>
  release: () => void
  fail: (error: Error) => void
} {
  const entered = Promise.withResolvers<SiteRunContext>()
  const parked = Promise.withResolvers<void>()
  const started = startRun(service, async (context) => {
    entered.resolve(context)
    await parked.promise
  })
  return {
    ...started,
    context: entered.promise,
    release: () => parked.resolve(),
    fail: (error) => parked.reject(error)
  }
}

function progressEvents(): SiteRunProgressEvent[] {
  return events.filter((event) => event.type === 'progress')
}

describe('run lifecycle', () => {
  it('returns a running run synchronously, before any event for it', async () => {
    const service = makeService()
    const parked = startParkedRun(service)
    const runId = parked.runId
    const [live] = service.listActive()
    expect(live.id).toBe(runId)
    expect(live.status).toBe('running')
    expect(events).toEqual([])
    parked.release()
    await service.waitFor(runId)
  })

  it('records stages and log lines, then reports success', async () => {
    const service = makeService()
    const { runId, siteId } = startRun(service, async (context) => {
      context.status('Connecting')
      context.log('connected')
    })
    await service.waitFor(runId)

    expect(events.at(-1)).toEqual({ type: 'status', runId, status: 'succeeded' })
    const page = service.readLog(siteId, runId)
    expect(page.lines.map((line) => [line.level, line.text])).toEqual([
      ['status', 'Connecting'],
      ['info', 'connected']
    ])
    expect(page.run?.status).toBe('succeeded')
    expect(page.run?.endedAt).not.toBeNull()
  })

  it('reports a thrown error as failed and writes it to the log', async () => {
    const service = makeService()
    const { runId, siteId } = startRun(service, async () => {
      throw new Error('mysqldump exited with 2')
    })
    await service.waitFor(runId)

    expect(events.at(-1)).toEqual({
      type: 'status',
      runId,
      status: 'failed',
      error: 'mysqldump exited with 2'
    })
    const page = service.readLog(siteId, runId)
    expect(page.firstErrorIndex).toBe(0)
    expect(page.run?.error).toBe('mysqldump exited with 2')
  })

  it('deregisters only after the terminal events have been emitted', async () => {
    const service = makeService()
    const { runId } = startRun(service, async (context) => {
      context.log('working')
    })
    await service.waitFor(runId)
    expect(service.listActive()).toEqual([])
    // The status event exists, so nothing was torn down before it was emitted.
    expect(events.some((event) => event.type === 'status')).toBe(true)
  })
})

describe('progress throttling', () => {
  it('emits the first update immediately and coalesces the rest into 100 ms windows', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    const service = makeService()
    const parked = startParkedRun(service)
    const context = await parked.context

    context.progress({ label: 'Downloading', transferred: 1, total: 100 })
    expect(progressEvents()).toHaveLength(1)

    // Same window: suppressed, however many times it fires.
    for (let tick = 2; tick <= 50; tick++) {
      now.mockReturnValue(1_000 + tick)
      context.progress({ label: 'Downloading', transferred: tick, total: 100 })
    }
    expect(progressEvents()).toHaveLength(1)

    now.mockReturnValue(1_100)
    context.progress({ label: 'Downloading', transferred: 60, total: 100 })
    expect(progressEvents()).toHaveLength(2)

    parked.release()
    await service.waitFor(parked.runId)
  })

  it('never throttles a stage boundary', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    const service = makeService()
    const parked = startParkedRun(service)
    const context = await parked.context

    context.progress({ label: 'A', transferred: 1, total: 10 })
    now.mockReturnValue(1_001)
    context.status('Stage B')
    expect(progressEvents()).toHaveLength(2)
    expect(progressEvents().at(-1)?.stage).toBe('Stage B')

    parked.release()
    await service.waitFor(parked.runId)
  })

  it('forces a final emit so a throttled last tick is not lost', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    const service = makeService()
    const parked = startParkedRun(service)
    const context = await parked.context

    context.progress({ label: 'Uploading', transferred: 1, total: 100 })
    now.mockReturnValue(1_010)
    context.progress({ label: 'Uploading', transferred: 100, total: 100 })
    expect(progressEvents()).toHaveLength(1)

    parked.release()
    await service.waitFor(parked.runId)

    const last = progressEvents().at(-1)
    expect(last?.transferred).toBe(100)
    expect(last?.percent).toBe(100)
  })

  it('reports an unknown total as an indeterminate percent rather than 0', async () => {
    const service = makeService()
    const parked = startParkedRun(service)
    const context = await parked.context
    context.progress({ label: 'Dumping', transferred: 4_096, total: 0 })
    expect(progressEvents().at(-1)?.percent).toBeNull()
    parked.release()
    await service.waitFor(parked.runId)
  })
})

describe('cancellation', () => {
  it('aborts the job signal and settles the run as cancelled', async () => {
    const service = makeService()
    const observed = Promise.withResolvers<void>()
    const { runId, siteId } = startRun(service, async (context) => {
      context.status('Connecting')
      await observed.promise
      context.throwIfCancelled()
    })
    await Promise.resolve()

    expect(service.cancel(runId)).toBe(true)
    observed.resolve()
    await service.waitFor(runId)

    expect(events.at(-1)).toEqual({ type: 'status', runId, status: 'cancelled' })
    expect(service.readLog(siteId, runId).run?.status).toBe('cancelled')
  })

  it('treats a bare AbortError from a killed subprocess as a cancellation', async () => {
    const service = makeService()
    const { runId } = startRun(service, async () => {
      const error = new Error('The operation was aborted.')
      error.name = 'AbortError'
      throw error
    })
    await service.waitFor(runId)
    expect(events.at(-1)).toEqual({ type: 'status', runId, status: 'cancelled' })
  })

  it('exposes the abort through throwIfCancelled', async () => {
    const service = makeService()
    const parked = startParkedRun(service)
    const context = await parked.context
    expect(() => context.throwIfCancelled()).not.toThrow()
    service.cancel(parked.runId)
    expect(() => context.throwIfCancelled()).toThrow(SiteRunCancelledError)
    parked.release()
    await service.waitFor(parked.runId)
  })

  it('returns false for an unknown run and for a second cancel', async () => {
    const service = makeService()
    expect(service.cancel('nope')).toBe(false)
    const parked = startParkedRun(service)
    expect(service.cancel(parked.runId)).toBe(true)
    expect(service.cancel(parked.runId)).toBe(false)
    parked.release()
    await service.waitFor(parked.runId)
  })

  it('cancelAll aborts every in-flight run', async () => {
    const service = makeService()
    const first = startParkedRun(service)
    const second = startParkedRun(service)
    service.cancelAll()
    const firstContext = await first.context
    const secondContext = await second.context
    expect(firstContext.signal.aborted).toBe(true)
    expect(secondContext.signal.aborted).toBe(true)
    first.release()
    second.release()
    await service.waitFor(first.runId)
    await service.waitFor(second.runId)
  })
})

// A closed and reopened run console must be able to rebuild its whole view from main.
describe('late subscriber catch-up', () => {
  it('serves the live run and its last progress even when that tick was throttled', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(2_000)
    const service = makeService()
    const parked = startParkedRun(service)
    const context = await parked.context

    context.progress({ label: 'Downloading', transferred: 1, total: 100 })
    now.mockReturnValue(2_005)
    context.progress({ label: 'Downloading', transferred: 42, total: 100 })
    expect(progressEvents()).toHaveLength(1)

    // The renderer remounted here and asks main for the truth.
    expect(service.listActive().map((run) => run.id)).toEqual([parked.runId])
    expect(service.getProgress(parked.runId)).toEqual({
      runId: parked.runId,
      stage: 'Downloading',
      transferred: 42,
      total: 100,
      percent: 42
    })

    parked.release()
    await service.waitFor(parked.runId)
  })

  it('resolves a finished run from disk once it has left the registry', async () => {
    const service = makeService()
    const { runId, siteId } = startRun(service, async (context) => {
      context.log('done')
    })
    await service.waitFor(runId)

    expect(service.listActive()).toEqual([])
    expect(service.getProgress(runId)).toBeNull()
    expect(service.get(siteId, runId)?.status).toBe('succeeded')
    expect(service.readLog(siteId, runId).lines.at(-1)?.text).toBe('done')
  })

  it('prefers the live entry over the persisted one while the run is in flight', async () => {
    const service = makeService()
    const parked = startParkedRun(service)
    expect(service.get(parked.siteId, parked.runId)?.status).toBe('running')
    parked.release()
    await service.waitFor(parked.runId)
    expect(service.get(parked.siteId, parked.runId)?.status).toBe('succeeded')
  })

  it('returns null for a run that never existed', () => {
    expect(makeService().get('site-1', 'nope')).toBeNull()
  })

  it('lists a site history across runs, newest first', async () => {
    const service = makeService()
    for (let index = 0; index < 3; index++) {
      const { runId } = startRun(service, async (context) => context.log(`run ${index}`))
      await service.waitFor(runId)
    }
    const history = service.listForSite('site-1')
    expect(history).toHaveLength(3)
    expect(history[0].startedAt).toBeGreaterThanOrEqual(history[1].startedAt)
  })
})

describe('run identity', () => {
  it('accepts a caller-supplied run id', async () => {
    const service = makeService()
    const run = service.start({
      runId: 'fixed-id',
      siteId: 'site-1',
      siteName: 'Acme',
      group: 'deploy',
      environment: 'staging',
      branch: 'staging',
      job: async () => {}
    })
    expect(run.id).toBe('fixed-id')
    expect(run.group).toBe('deploy')
    expect(run.environment).toBe('staging')
    await service.waitFor('fixed-id')
  })

  it('mints distinct ids for concurrent runs', async () => {
    const service = makeService()
    const first = startParkedRun(service)
    const second = startParkedRun(service)
    expect(first.runId).not.toBe(second.runId)
    expect(service.listActive()).toHaveLength(2)
    first.release()
    second.release()
    await service.waitFor(first.runId)
    await service.waitFor(second.runId)
  })
})
