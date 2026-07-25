// Per-run log persistence: <base>/<siteId>/<runId>/{meta.json,output.log}.
//
// Directory layout follows HistoryManager.openSession (src/main/daemon/history-manager.ts:67) and
// the append-only NDJSON writer is createDaemonFileLog, so rotation, the 0600 mode and the
// fail-open posture are inherited rather than reimplemented. Retention is ported from ocsites
// (deploy/run_history.py:216): 30 days, 200 runs per site.
//
// Everything here is fail-open. A run must never die because its log could not be written.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { createDaemonFileLog, type DaemonFileLog } from '../daemon/daemon-file-log'
import type {
  SiteRun,
  SiteRunLogLevel,
  SiteRunLogLine,
  SiteRunLogPage,
  SiteRunStatus
} from '../../shared/site-run-types'

export const SITE_RUNS_DIR_NAME = 'site-runs'
export const SITE_RUN_KEEP_DAYS = 30
export const SITE_RUN_MAX_PER_SITE = 200
const DEFAULT_TAIL_LINES = 500
const LOG_MAX_BYTES = 5 * 1024 * 1024
const LOG_ROTATED_FILES = 1
const META_FILE = 'meta.json'
const LOG_FILE = 'output.log'
const LOG_LEVELS: readonly string[] = ['info', 'error', 'status']

/** ocsites' _slugify, hardened: this is also the traversal guard for ids that arrive over IPC. */
function safeSegment(value: string): string {
  const cleaned = value.replaceAll(/[^A-Za-z0-9._-]+/g, '-').replaceAll(/^[-.]+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'unknown'
}

export function siteRunDir(baseDir: string, siteId: string, runId: string): string {
  return join(baseDir, safeSegment(siteId), safeSegment(runId))
}

function writeMeta(dir: string, run: SiteRun): void {
  try {
    writeFileSync(join(dir, META_FILE), JSON.stringify(run, null, 2))
  } catch {
    // An unwritable log directory must not fail the run.
  }
}

function isSiteRunRecord(value: unknown): value is SiteRun {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.siteId === 'string'
}

function readMeta(dir: string): SiteRun | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, META_FILE), 'utf8'))
    return isSiteRunRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export type SiteRunLogHandle = {
  /** The run as persisted, including the resolved logPath. Reflects the latest finalize(). */
  readonly run: SiteRun
  append: (line: SiteRunLogLine) => void
  /** Rewrites meta.json with the terminal state and closes the file. Returns the finished run. */
  finalize: (status: SiteRunStatus, error: string | null, endedAt?: number) => SiteRun
}

export function createSiteRunLog(baseDir: string, run: SiteRun): SiteRunLogHandle {
  const dir = siteRunDir(baseDir, run.siteId, run.id)
  let fileLog: DaemonFileLog | null = null
  try {
    mkdirSync(dir, { recursive: true })
    fileLog = createDaemonFileLog(join(dir, LOG_FILE), {
      maxBytes: LOG_MAX_BYTES,
      maxRotatedFiles: LOG_ROTATED_FILES
    })
  } catch {
    fileLog = null
  }
  let current: SiteRun = { ...run, logPath: join(dir, LOG_FILE) }
  writeMeta(dir, current)

  return {
    get run(): SiteRun {
      return current
    },
    append(line) {
      fileLog?.log(line.level, { at: line.at, text: line.text })
    },
    finalize(status, error, endedAt) {
      current = { ...current, status, error, endedAt: endedAt ?? Date.now() }
      writeMeta(dir, current)
      fileLog?.close()
      fileLog = null
      return current
    }
  }
}

function parseLogLine(raw: string): SiteRunLogLine | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const record = parsed as Record<string, unknown>
    if (!LOG_LEVELS.includes(String(record.event)) || typeof record.text !== 'string') {
      return null
    }
    return {
      at: typeof record.at === 'number' ? record.at : 0,
      level: record.event as SiteRunLogLevel,
      text: record.text
    }
  } catch {
    return null
  }
}

/** Reads the rotated file first so a run that just rolled over still shows a full tail. */
function readLogLines(dir: string): SiteRunLogLine[] {
  const lines: SiteRunLogLine[] = []
  for (const name of [`${LOG_FILE}.1`, LOG_FILE]) {
    let contents: string
    try {
      contents = readFileSync(join(dir, name), 'utf8')
    } catch {
      continue
    }
    for (const raw of contents.split('\n')) {
      if (raw.trim().length === 0) {
        continue
      }
      const line = parseLogLine(raw)
      if (line) {
        lines.push(line)
      }
    }
  }
  return lines
}

/** ocsites' `e` key: the first error is where a failed run actually went wrong. */
export function findFirstErrorIndex(lines: readonly SiteRunLogLine[]): number {
  return lines.findIndex((line) => line.level === 'error')
}

export function readSiteRunLog(
  baseDir: string,
  siteId: string,
  runId: string,
  maxLines: number = DEFAULT_TAIL_LINES
): SiteRunLogPage {
  const dir = siteRunDir(baseDir, siteId, runId)
  const lines = readLogLines(dir)
  const windowed = maxLines > 0 && lines.length > maxLines ? lines.slice(-maxLines) : lines
  return {
    run: readMeta(dir),
    lines: windowed,
    truncatedEarlier: lines.length - windowed.length,
    firstErrorIndex: findFirstErrorIndex(windowed)
  }
}

type DatedDir = { path: string; mtimeMs: number }

/** Directory children, newest first. mtime not name, so a caller-supplied runId cannot reorder. */
function listDatedDirs(parent: string): DatedDir[] {
  let names: string[]
  try {
    names = readdirSync(parent)
  } catch {
    return []
  }
  const dirs: DatedDir[] = []
  for (const name of names) {
    const path = join(parent, name)
    try {
      const stats = statSync(path)
      if (stats.isDirectory()) {
        dirs.push({ path, mtimeMs: stats.mtimeMs })
      }
    } catch {
      continue
    }
  }
  return dirs.sort((left, right) => right.mtimeMs - left.mtimeMs)
}

export function listSiteRuns(baseDir: string, siteId: string, limit = 20): SiteRun[] {
  const runs: SiteRun[] = []
  for (const dir of listDatedDirs(join(baseDir, safeSegment(siteId)))) {
    if (runs.length >= limit) {
      break
    }
    const run = readMeta(dir.path)
    if (run) {
      runs.push(run)
    }
  }
  return runs.sort((left, right) => right.startedAt - left.startedAt)
}

export type PruneSiteRunsOptions = {
  keepDays?: number
  maxPerSite?: number
}

/** Deletes runs past the age or per-site cap. Returns how many directories were removed. */
export function pruneSiteRuns(baseDir: string, options: PruneSiteRunsOptions = {}): number {
  const keepDays = options.keepDays ?? SITE_RUN_KEEP_DAYS
  const maxPerSite = options.maxPerSite ?? SITE_RUN_MAX_PER_SITE
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000
  if (!existsSync(baseDir)) {
    return 0
  }
  let removed = 0
  for (const siteDir of listDatedDirs(baseDir)) {
    for (const [index, runDir] of listDatedDirs(siteDir.path).entries()) {
      if (index < maxPerSite && runDir.mtimeMs >= cutoff) {
        continue
      }
      try {
        rmSync(runDir.path, { recursive: true, force: true })
        removed += 1
      } catch {
        continue
      }
    }
  }
  return removed
}
