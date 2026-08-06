// Wire types for site import/deploy runs.
//
// Browser-safe by construction: no node imports, no Electron, no behaviour. The renderer, the
// preload bridge and the main-process run service all agree on these shapes and nothing else.

import type { SiteRunGroup } from './site-types'

export type SiteRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'

/** `status` marks the start of a named stage; the run console renders it as a stepper heading. */
export type SiteRunLogLevel = 'info' | 'error' | 'status'

export type SiteRunLogLine = {
  at: number
  level: SiteRunLogLevel
  text: string
}

export type SiteRunProgressEvent = {
  runId: string
  stage: string
  transferred: number
  total: number
  /** Null when the total is unknown — an indeterminate bar, not 0 %. */
  percent: number | null
}

/** Pushed to the renderer on `siteRuns:event`. */
export type SiteRunEvent =
  | { type: 'log'; runId: string; line: SiteRunLogLine }
  | ({ type: 'progress' } & SiteRunProgressEvent)
  | { type: 'status'; runId: string; status: SiteRunStatus; error?: string }

export type SiteRun = {
  id: string
  siteId: string
  siteName: string
  group: SiteRunGroup
  environment: string
  branch: string | null
  status: SiteRunStatus
  startedAt: number
  endedAt: number | null
  error: string | null
  logPath: string
  /** The process that owns the run, so a reader can detect a runner that died mid-run. */
  pid?: number
}

/** Catch-up payload for a renderer that mounted mid-run: live run plus its last known progress. */
export type SiteActiveRun = {
  run: SiteRun
  progress: SiteRunProgressEvent | null
}

/** A window onto a persisted run log: the tail, plus enough context to explain what was dropped. */
export type SiteRunLogPage = {
  run: SiteRun | null
  lines: SiteRunLogLine[]
  /** Lines dropped from the front, by tail windowing or log rotation. */
  truncatedEarlier: number
  /** Index into `lines` of the first error, or -1. Drives ocsites' `e` jump-to-first-error key. */
  firstErrorIndex: number
}

/**
 * Why a run cannot start. Lives in shared/ because both the run console and the guided setup
 * dialog render it, and the run planner in main is the single producer.
 */
export type SiteRunBlockedReason =
  | 'no-environment'
  | 'no-steps-selected'
  | 'unmatched-branch'
  | 'missing-ssh-credentials'
  | 'missing-path'
