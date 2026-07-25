import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SiteRun, SiteRunLogLine } from '../../shared/site-run-types'
import {
  createSiteRunLog,
  findFirstErrorIndex,
  listSiteRuns,
  pruneSiteRuns,
  readSiteRunLog,
  siteRunDir
} from './site-run-log'

let baseDir = ''

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'muster-site-runs-'))
})

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true })
})

function makeRun(overrides: Partial<SiteRun> = {}): SiteRun {
  return {
    id: 'run-1',
    siteId: 'site-1',
    siteName: 'Acme',
    group: 'import',
    environment: 'main',
    branch: 'main',
    status: 'running',
    startedAt: 1_700_000_000_000,
    endedAt: null,
    error: null,
    logPath: '',
    ...overrides
  }
}

function line(level: SiteRunLogLine['level'], text: string, at = 1): SiteRunLogLine {
  return { at, level, text }
}

describe('createSiteRunLog', () => {
  it('writes meta.json and output.log under <site>/<run>', () => {
    const log = createSiteRunLog(baseDir, makeRun())
    log.append(line('info', 'hello'))
    const dir = siteRunDir(baseDir, 'site-1', 'run-1')
    expect(readdirSync(dir).sort()).toEqual(['meta.json', 'output.log'])
    expect(log.run.logPath).toBe(join(dir, 'output.log'))
  })

  it('round-trips level and text through the NDJSON format', () => {
    const log = createSiteRunLog(baseDir, makeRun())
    log.append(line('status', 'Connecting', 10))
    log.append(line('info', 'connected', 11))
    log.append(line('error', 'boom', 12))
    log.finalize('failed', 'boom')

    const page = readSiteRunLog(baseDir, 'site-1', 'run-1')
    expect(page.lines).toEqual([
      { at: 10, level: 'status', text: 'Connecting' },
      { at: 11, level: 'info', text: 'connected' },
      { at: 12, level: 'error', text: 'boom' }
    ])
  })

  it('records the terminal state in meta.json', () => {
    const log = createSiteRunLog(baseDir, makeRun())
    const finished = log.finalize('succeeded', null, 1_700_000_010_000)
    expect(finished.status).toBe('succeeded')
    expect(finished.endedAt).toBe(1_700_000_010_000)
    expect(log.run.status).toBe('succeeded')
    expect(readSiteRunLog(baseDir, 'site-1', 'run-1').run?.status).toBe('succeeded')
  })

  it('keeps a run alive when its log directory cannot be written', () => {
    // A file where the site directory should be makes every fs call fail.
    writeFileSync(join(baseDir, 'blocked'), 'not a directory')
    const log = createSiteRunLog(join(baseDir, 'blocked'), makeRun())
    expect(() => log.append(line('info', 'still fine'))).not.toThrow()
    expect(log.finalize('succeeded', null).status).toBe('succeeded')
  })

  it('refuses to escape the base directory via a traversing id', () => {
    const log = createSiteRunLog(baseDir, makeRun({ siteId: '../../etc', id: '../evil' }))
    expect(log.run.logPath.startsWith(baseDir)).toBe(true)
    expect(log.run.logPath).not.toContain('..')
  })
})

describe('readSiteRunLog windowing', () => {
  it('returns the tail and reports how many lines were dropped', () => {
    const log = createSiteRunLog(baseDir, makeRun())
    for (let index = 0; index < 50; index++) {
      log.append(line('info', `line-${index}`, index))
    }
    const page = readSiteRunLog(baseDir, 'site-1', 'run-1', 10)
    expect(page.lines).toHaveLength(10)
    expect(page.lines[0].text).toBe('line-40')
    expect(page.truncatedEarlier).toBe(40)
  })

  it('returns everything when maxLines is 0', () => {
    const log = createSiteRunLog(baseDir, makeRun())
    log.append(line('info', 'only'))
    expect(readSiteRunLog(baseDir, 'site-1', 'run-1', 0).lines).toHaveLength(1)
  })

  it('reads the rotated file first so a just-rolled log still shows its history', () => {
    const dir = siteRunDir(baseDir, 'site-1', 'run-1')
    mkdirSync(dir, { recursive: true })
    const encode = (level: string, text: string): string =>
      `${JSON.stringify({ event: level, at: 1, text })}\n`
    writeFileSync(join(dir, 'output.log.1'), encode('info', 'older'))
    writeFileSync(join(dir, 'output.log'), encode('info', 'newer'))

    const page = readSiteRunLog(baseDir, 'site-1', 'run-1')
    expect(page.lines.map((entry) => entry.text)).toEqual(['older', 'newer'])
  })

  it('skips malformed and non-run lines rather than failing the read', () => {
    const dir = siteRunDir(baseDir, 'site-1', 'run-1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'output.log'),
      [
        'not json at all',
        JSON.stringify({ event: 'daemon-log-closed' }),
        JSON.stringify({ event: 'info', at: 5, text: 'kept' }),
        ''
      ].join('\n')
    )
    expect(readSiteRunLog(baseDir, 'site-1', 'run-1').lines).toEqual([
      { at: 5, level: 'info', text: 'kept' }
    ])
  })

  it('reports an empty page for a run that does not exist', () => {
    const page = readSiteRunLog(baseDir, 'site-1', 'missing')
    expect(page.run).toBeNull()
    expect(page.lines).toEqual([])
    expect(page.firstErrorIndex).toBe(-1)
  })
})

describe('findFirstErrorIndex', () => {
  it('points at the first error, not the last', () => {
    expect(
      findFirstErrorIndex([
        line('info', 'a'),
        line('error', 'first failure'),
        line('info', 'b'),
        line('error', 'second failure')
      ])
    ).toBe(1)
  })

  it('returns -1 when nothing failed', () => {
    expect(findFirstErrorIndex([line('info', 'a'), line('status', 'b')])).toBe(-1)
  })

  it('is surfaced on the log page so the console can jump straight to it', () => {
    const log = createSiteRunLog(baseDir, makeRun())
    log.append(line('info', 'ok'))
    log.append(line('error', 'the real cause'))
    log.append(line('error', 'downstream noise'))
    const page = readSiteRunLog(baseDir, 'site-1', 'run-1')
    expect(page.firstErrorIndex).toBe(1)
    expect(page.lines[page.firstErrorIndex].text).toBe('the real cause')
  })
})

describe('listSiteRuns', () => {
  it('returns runs newest first and honours the limit', () => {
    for (let index = 0; index < 5; index++) {
      createSiteRunLog(
        baseDir,
        makeRun({ id: `run-${index}`, startedAt: 1_700_000_000_000 + index })
      ).finalize('succeeded', null)
    }
    const runs = listSiteRuns(baseDir, 'site-1', 3)
    expect(runs).toHaveLength(3)
    expect(runs[0].startedAt).toBeGreaterThan(runs[1].startedAt)
  })

  it('ignores run directories with no readable meta.json', () => {
    createSiteRunLog(baseDir, makeRun({ id: 'good' })).finalize('succeeded', null)
    mkdirSync(siteRunDir(baseDir, 'site-1', 'orphan'), { recursive: true })
    expect(listSiteRuns(baseDir, 'site-1').map((run) => run.id)).toEqual(['good'])
  })

  it('returns nothing for an unknown site', () => {
    expect(listSiteRuns(baseDir, 'never-ran')).toEqual([])
  })
})

describe('pruneSiteRuns retention', () => {
  function ageDirectory(path: string, days: number): void {
    const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    utimesSync(path, when, when)
  }

  it('drops runs beyond the per-site cap, keeping the newest', () => {
    for (let index = 0; index < 6; index++) {
      createSiteRunLog(baseDir, makeRun({ id: `run-${index}` })).finalize('succeeded', null)
    }
    expect(pruneSiteRuns(baseDir, { maxPerSite: 2, keepDays: 3650 })).toBe(4)
    expect(readdirSync(join(baseDir, 'site-1'))).toHaveLength(2)
  })

  it('drops runs older than the retention window', () => {
    createSiteRunLog(baseDir, makeRun({ id: 'fresh' })).finalize('succeeded', null)
    createSiteRunLog(baseDir, makeRun({ id: 'stale' })).finalize('succeeded', null)
    ageDirectory(siteRunDir(baseDir, 'site-1', 'stale'), 45)

    expect(pruneSiteRuns(baseDir, { keepDays: 30, maxPerSite: 200 })).toBe(1)
    expect(listSiteRuns(baseDir, 'site-1').map((run) => run.id)).toEqual(['fresh'])
  })

  it('prunes each site independently', () => {
    createSiteRunLog(baseDir, makeRun({ siteId: 'a', id: 'a1' })).finalize('succeeded', null)
    createSiteRunLog(baseDir, makeRun({ siteId: 'a', id: 'a2' })).finalize('succeeded', null)
    createSiteRunLog(baseDir, makeRun({ siteId: 'b', id: 'b1' })).finalize('succeeded', null)

    expect(pruneSiteRuns(baseDir, { maxPerSite: 1, keepDays: 3650 })).toBe(1)
    expect(listSiteRuns(baseDir, 'a')).toHaveLength(1)
    expect(listSiteRuns(baseDir, 'b')).toHaveLength(1)
  })

  it('returns 0 for a base directory that was never created', () => {
    expect(pruneSiteRuns(join(baseDir, 'nope'))).toBe(0)
  })
})
