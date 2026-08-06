// The site run registry: one in-flight job per runId, progress throttling, cancellation, and the
// state a remounted renderer needs to catch up.
//
// Modelled on registerWorkspaceSpaceHandlers (src/main/ipc/workspace-space.ts:14) — in-flight map,
// AbortController, 100 ms-throttled progress with a forced first and terminal emit — but a run is
// long-lived and observable, so the entry also caches the latest progress. Deliberately NOT the
// fire-and-forget clone pattern: closing the run console must not lose the run.
//
// The work itself is injected. This module knows nothing about SSH, MySQL or WordPress.

import { randomUUID } from 'node:crypto'
import type {
  SiteRun,
  SiteRunEvent,
  SiteRunLogLine,
  SiteRunLogLevel,
  SiteRunLogPage,
  SiteRunProgressEvent,
  SiteRunStatus
} from '../../shared/site-run-types'
import type { SiteRunGroup } from '../../shared/site-types'
import { SiteRunCancelledError, type SiteRunContext } from './pipeline-contract'
import {
  createSiteRunLog,
  listSiteRuns,
  readSiteRunLog,
  type SiteRunLogHandle
} from './site-run-log'

const PROGRESS_EMIT_INTERVAL_MS = 100

/** The actual work. Pipelines are wired in here so the service never imports them. */
export type SiteRunJob = (context: SiteRunContext) => Promise<void>

export type StartSiteRunOptions = {
  /** Supply one to correlate with a caller-side id; otherwise a uuid is minted. */
  runId?: string
  siteId: string
  siteName: string
  group: SiteRunGroup
  environment: string
  branch: string | null
  job: SiteRunJob
}

export type SiteRunServiceOptions = {
  baseDir: string
  emit: (event: SiteRunEvent) => void
}

type InFlightSiteRun = {
  controller: AbortController
  run: SiteRun
  progress: SiteRunProgressEvent
  promise: Promise<void>
}

export type SiteRunService = {
  start: (options: StartSiteRunOptions) => SiteRun
  /** False when the run is unknown or already aborting. */
  cancel: (runId: string) => boolean
  listActive: () => SiteRun[]
  /** Live entry first, then the persisted meta.json — a finished run is still resolvable. */
  get: (siteId: string, runId: string) => SiteRun | null
  getProgress: (runId: string) => SiteRunProgressEvent | null
  listForSite: (siteId: string, limit?: number) => SiteRun[]
  readLog: (siteId: string, runId: string, maxLines?: number) => SiteRunLogPage
  /** Resolves once the run has fully deregistered. */
  waitFor: (runId: string) => Promise<void>
  cancelAll: () => void
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof SiteRunCancelledError ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

export function createSiteRunService(options: SiteRunServiceOptions): SiteRunService {
  const active = new Map<string, InFlightSiteRun>()

  function start(request: StartSiteRunOptions): SiteRun {
    const runId = request.runId ?? randomUUID()
    const startedAt = Date.now()
    const controller = new AbortController()
    const log = createSiteRunLog(options.baseDir, {
      id: runId,
      siteId: request.siteId,
      siteName: request.siteName,
      group: request.group,
      environment: request.environment,
      branch: request.branch,
      status: 'running',
      startedAt,
      endedAt: null,
      error: null,
      logPath: '',
      pid: process.pid
    })
    const entry: InFlightSiteRun = {
      controller,
      run: log.run,
      progress: { runId, stage: '', transferred: 0, total: 0, percent: null },
      promise: Promise.resolve()
    }
    active.set(runId, entry)
    entry.promise = runJob(runId, entry, log, request.job)
    return entry.run
  }

  function runJob(
    runId: string,
    entry: InFlightSiteRun,
    log: SiteRunLogHandle,
    job: SiteRunJob
  ): Promise<void> {
    let stage = ''
    let lastProgressSentAt = 0

    const record = (level: SiteRunLogLevel, text: string): void => {
      const line: SiteRunLogLine = { at: Date.now(), level, text }
      log.append(line)
      options.emit({ type: 'log', runId, line })
    }
    const emitProgress = (next: SiteRunProgressEvent, force: boolean): void => {
      entry.progress = next
      const now = Date.now()
      // Why: a byte-progress callback can fire thousands of times a second; the console only
      // needs 10 Hz. The first and every stage-boundary emit bypass the throttle so the UI is
      // never left showing a stale stage.
      if (
        !force &&
        lastProgressSentAt !== 0 &&
        now - lastProgressSentAt < PROGRESS_EMIT_INTERVAL_MS
      ) {
        return
      }
      lastProgressSentAt = now
      options.emit({ type: 'progress', ...next })
    }
    const context: SiteRunContext = {
      signal: entry.controller.signal,
      log: (line) => record('info', line),
      status: (nextStage) => {
        stage = nextStage
        record('status', nextStage)
        emitProgress({ runId, stage, transferred: 0, total: 0, percent: null }, true)
      },
      progress: ({ label, transferred, total }) => {
        emitProgress(
          {
            runId,
            stage: label.length > 0 ? label : stage,
            transferred,
            total,
            percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : null
          },
          false
        )
      },
      throwIfCancelled: () => {
        if (entry.controller.signal.aborted) {
          throw new SiteRunCancelledError()
        }
      }
    }

    const settle = (status: SiteRunStatus, error: string | null): void => {
      if (error) {
        record('error', error)
      }
      entry.run = log.finalize(status, error)
      // Flush whatever the last progress was, so a subscriber that missed a throttled tick
      // still ends on the true final numbers.
      emitProgress(entry.progress, true)
      options.emit({ type: 'status', runId, status, ...(error ? { error } : {}) })
    }

    // Why: defer past this tick so start() has returned its SiteRun before any event for it.
    return Promise.resolve()
      .then(() => job(context))
      .then(() => settle('succeeded', null))
      .catch((error: unknown) => {
        if (isCancellation(error)) {
          settle('cancelled', null)
          return
        }
        settle('failed', error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        // Outermost finally: the entry stays reachable for the whole lifecycle, including the
        // terminal emits above, so a late subscriber can never observe a half-torn-down run.
        active.delete(runId)
      })
  }

  return {
    start,
    cancel(runId) {
      const entry = active.get(runId)
      if (!entry || entry.controller.signal.aborted) {
        return false
      }
      entry.controller.abort()
      return true
    },
    listActive() {
      return [...active.values()].map((entry) => entry.run)
    },
    get(siteId, runId) {
      return active.get(runId)?.run ?? readSiteRunLog(options.baseDir, siteId, runId, 0).run
    },
    getProgress(runId) {
      return active.get(runId)?.progress ?? null
    },
    listForSite(siteId, limit) {
      return listSiteRuns(options.baseDir, siteId, limit)
    },
    readLog(siteId, runId, maxLines) {
      return readSiteRunLog(options.baseDir, siteId, runId, maxLines)
    },
    async waitFor(runId) {
      await active.get(runId)?.promise
    },
    cancelAll() {
      for (const entry of active.values()) {
        entry.controller.abort()
      }
    }
  }
}
