// Small JSON records the ACF tools hand back as a token: an undo payload, or a snapshot.
//
// On disk rather than in memory because the MCP server is respawned per session and a revert is
// worth nothing if it dies with the process. Retention runs on every write, so a long-running site
// never accumulates: the point is "undo what I just did", not an archive.

import { randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type AcfStateKind = 'revert' | 'snapshot'

export type AcfStateRecord = {
  kind: AcfStateKind
  token: string
  site_id: string
  location: 'local' | 'remote'
  environment: string | null
  target: unknown
  when: string
  summary: string
  digests: Record<string, string>
  consumed?: string
  payload: unknown
}

export type AcfStateStore = {
  save: (record: Omit<AcfStateRecord, 'token' | 'when'>) => AcfStateRecord
  load: (siteId: string, token: string) => AcfStateRecord | null
  list: (siteId: string, kind: AcfStateKind, limit: number) => AcfStateRecord[]
  markConsumed: (siteId: string, token: string) => AcfStateRecord | null
}

const RETENTION: Record<AcfStateKind, { keep: number; maxAgeMs: number }> = {
  revert: { keep: 20, maxAgeMs: 24 * 60 * 60 * 1000 },
  snapshot: { keep: 10, maxAgeMs: 7 * 24 * 60 * 60 * 1000 }
}

const TOKEN_PATTERN = /^[0-9a-f]{8}$/

/** Beside the run logs, so both live under the same user-data directory the app already owns. */
export function acfStateDir(runsBaseDir: string): string {
  return path.join(path.dirname(runsBaseDir), 'acf-state')
}

export function isAcfStateToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

// A site id reaches here from the store, but it also names a directory, so it is not trusted to.
function siteDir(baseDir: string, siteId: string): string {
  return path.join(baseDir, siteId.replace(/[^A-Za-z0-9._-]/g, '_'))
}

function readRecord(file: string): AcfStateRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const record = parsed as AcfStateRecord
    return typeof record.token === 'string' && typeof record.when === 'string' ? record : null
  } catch {
    // A truncated or hand-edited file is skipped, never thrown: one bad record must not hide the rest.
    return null
  }
}

function readAll(dir: string): AcfStateRecord[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const records: AcfStateRecord[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue
    }
    const record = readRecord(path.join(dir, name))
    if (record) {
      records.push(record)
    }
  }
  return records.sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0))
}

function prune(dir: string, kind: AcfStateKind, now: number): void {
  const { keep, maxAgeMs } = RETENTION[kind]
  const ofKind = readAll(dir).filter((record) => record.kind === kind)
  for (const [index, record] of ofKind.entries()) {
    const age = now - Date.parse(record.when)
    if (index < keep && !(Number.isFinite(age) && age > maxAgeMs)) {
      continue
    }
    try {
      rmSync(path.join(dir, `${record.token}.json`))
    } catch {
      // Losing the race with another server's prune is the expected outcome, not a failure.
    }
  }
}

export function createAcfStateStore(baseDir: string): AcfStateStore {
  const write = (dir: string, record: AcfStateRecord): void => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `${record.token}.json`), JSON.stringify(record), {
      encoding: 'utf8',
      mode: 0o600
    })
  }
  return {
    save: (input) => {
      const record: AcfStateRecord = {
        ...input,
        token: randomBytes(4).toString('hex'),
        when: new Date().toISOString()
      }
      const dir = siteDir(baseDir, record.site_id)
      write(dir, record)
      prune(dir, record.kind, Date.now())
      return record
    },
    load: (siteId, token) =>
      isAcfStateToken(token)
        ? readRecord(path.join(siteDir(baseDir, siteId), `${token}.json`))
        : null,
    list: (siteId, kind, limit) =>
      readAll(siteDir(baseDir, siteId))
        .filter((record) => record.kind === kind)
        .slice(0, Math.max(limit, 0)),
    markConsumed: (siteId, token) => {
      const dir = siteDir(baseDir, siteId)
      const record = isAcfStateToken(token) ? readRecord(path.join(dir, `${token}.json`)) : null
      if (!record) {
        return null
      }
      const consumed: AcfStateRecord = { ...record, consumed: new Date().toISOString() }
      write(dir, consumed)
      return consumed
    }
  }
}
