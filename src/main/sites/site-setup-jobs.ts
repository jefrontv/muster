// Long setup work an agent started (a local stack setup takes minutes). The tool returns a job id at
// once and the agent polls, because an MCP call cannot stay open that long.

import { randomUUID } from 'node:crypto'
import type { SiteSetupJobUpdate } from '../../shared/site-setup-approval-types'

const LOG_LIMIT = 200
const RETENTION_MS = 3_600_000

export type SiteSetupJobView = {
  id: string
  siteId: string
  label: string
  state: 'running' | 'succeeded' | 'failed'
  log: string[]
  result: unknown
  error: string
  startedAt: number
  endedAt: number | null
  progress: { phase: string; percent: number | null } | null
}

export type SiteSetupJobProgress = (phase: string, percent: number | null) => void

const jobs = new Map<string, SiteSetupJobView>()
let sendUpdate: ((update: SiteSetupJobUpdate) => void) | null = null

/** Where job updates go (the window's progress toast). Set once by main. */
export function setSiteSetupJobListener(listener: typeof sendUpdate): void {
  sendUpdate = listener
}

function notify(job: SiteSetupJobView): void {
  sendUpdate?.({
    id: job.id,
    label: job.label,
    state: job.state,
    phase: job.progress?.phase ?? '',
    percent: job.progress?.percent ?? null,
    error: job.error
  })
}

/** `work` resolves `{ ok }`-shaped results; `ok: false` or a throw marks the job failed. */
export function startSiteSetupJob(
  siteId: string,
  label: string,
  work: (log: (message: string) => void, progress: SiteSetupJobProgress) => Promise<unknown>
): string {
  const job: SiteSetupJobView = {
    id: randomUUID(),
    siteId,
    label,
    state: 'running',
    log: [],
    result: null,
    error: '',
    startedAt: Date.now(),
    endedAt: null,
    progress: null
  }
  jobs.set(job.id, job)
  notify(job)
  const log = (message: string): void => {
    job.log.push(message)
    if (job.log.length > LOG_LIMIT) {
      job.log.splice(0, job.log.length - LOG_LIMIT)
    }
  }
  const progress: SiteSetupJobProgress = (phase, percent) => {
    // git repeats the same percent many times a second; only a visible change goes to the window.
    if (job.progress?.phase === phase && job.progress.percent === percent) {
      return
    }
    job.progress = { phase, percent }
    notify(job)
  }
  const finish = (state: 'succeeded' | 'failed', result: unknown, error: string): void => {
    Object.assign(job, { state, result, error, endedAt: Date.now() })
    notify(job)
    setTimeout(() => jobs.delete(job.id), RETENTION_MS).unref?.()
  }
  void work(log, progress).then(
    (result) => {
      const failed = (result as { ok?: unknown } | null)?.ok === false
      const reason = (result as { error?: unknown } | null)?.error
      finish(failed ? 'failed' : 'succeeded', result, failed ? String(reason ?? 'failed') : '')
    },
    (error: unknown) =>
      finish('failed', null, error instanceof Error ? error.message : String(error))
  )
  return job.id
}

/** Returns once the job's state, step or percent moves, or when `waitMs` runs out. */
export async function waitForSiteSetupJob(
  id: string,
  waitMs: number
): Promise<SiteSetupJobView | null> {
  const before = getSiteSetupJob(id)
  if (!before || before.state !== 'running' || waitMs <= 0) {
    return before
  }
  const stamp = (job: SiteSetupJobView | null): string =>
    job ? `${job.state}:${job.progress?.phase ?? ''}:${job.progress?.percent ?? ''}` : ''
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const now = getSiteSetupJob(id)
    if (stamp(now) !== stamp(before)) {
      return now
    }
  }
  return getSiteSetupJob(id)
}

export function getSiteSetupJob(id: string): SiteSetupJobView | null {
  const job = jobs.get(id)
  return job ? { ...job, log: [...job.log], progress: job.progress && { ...job.progress } } : null
}

/** Test-only. */
export function clearSiteSetupJobsForTests(): void {
  jobs.clear()
}
