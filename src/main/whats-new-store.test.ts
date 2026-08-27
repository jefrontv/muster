import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getWhatsNewFilePath, readWhatsNewRecord, writeWhatsNewRecord } from './whats-new-store'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'whats-new-store-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('whats-new-store', () => {
  it('reads back a written record atomically (no temp file left behind)', () => {
    const file = getWhatsNewFilePath(dir)
    writeWhatsNewRecord(file, { lastRunVersion: '1.5.53' })

    expect(readWhatsNewRecord(file)).toEqual({ lastRunVersion: '1.5.53' })
    expect(readFileSync(file, 'utf8')).not.toContain('tmp')
    expect(() => readFileSync(`${file}.tmp`, 'utf8')).toThrow()
  })

  it('treats a missing file as an empty record', () => {
    expect(readWhatsNewRecord(getWhatsNewFilePath(dir))).toEqual({})
  })

  it('treats a corrupt file as an empty record rather than throwing', () => {
    const file = getWhatsNewFilePath(dir)
    writeFileSync(file, '{ not json', 'utf8')

    expect(readWhatsNewRecord(file)).toEqual({})
  })

  it('ignores a record whose version field is the wrong type', () => {
    const file = getWhatsNewFilePath(dir)
    writeFileSync(file, JSON.stringify({ lastRunVersion: 42 }), 'utf8')

    expect(readWhatsNewRecord(file)).toEqual({})
  })
})
