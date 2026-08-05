import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DURABILITY_JOURNAL_VERSION,
  PersistenceDurabilityJournal,
  getDurabilityJournalFile,
  type DurabilityJournalRecord
} from './persistence-durability-journal'

// Real fs, not mocks: this module's contract is what survives on disk after a
// process death mid-append, which a mocked fs cannot demonstrate.

const ptyBinding: DurabilityJournalRecord = {
  op: 'pty-binding',
  args: { worktreeId: 'w1', tabId: 't1', leafId: 'l1', ptyId: 'p1' },
  hostId: null
}
const claudeSession: DurabilityJournalRecord = {
  op: 'claude-live-pty-session',
  sessionId: 's1'
}

describe('PersistenceDurabilityJournal', () => {
  let root: string
  let dataFile: string
  let journalFile: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-journal-'))
    dataFile = join(root, 'orca-data.json')
    journalFile = getDurabilityJournalFile(dataFile)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('round-trips appended records in sequence order', () => {
    const journal = new PersistenceDurabilityJournal(dataFile)
    journal.append(ptyBinding)
    journal.append(claudeSession)

    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([
      ptyBinding,
      claudeSession
    ])
  })

  it('sits beside the data file rather than inside it', () => {
    expect(journalFile).toBe(join(root, 'orca-data-journal.ndjson'))
  })

  it('skips a torn trailing line but keeps every complete record before it', () => {
    const journal = new PersistenceDurabilityJournal(dataFile)
    journal.append(ptyBinding)
    // Simulate SIGKILL mid-append: a truncated JSON fragment with no newline.
    appendFileSync(journalFile, '\n{"v":1,"seq":2,"record":{"op":"pty-bin', 'utf-8')

    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([ptyBinding])
  })

  it('does not let a torn line swallow the record appended after it', () => {
    const journal = new PersistenceDurabilityJournal(dataFile)
    journal.append(ptyBinding)
    appendFileSync(journalFile, '\n{"v":1,"seq":2,"reco', 'utf-8')

    // The leading-newline guard means this lands on its own line, not glued to the fragment.
    const recovered = new PersistenceDurabilityJournal(dataFile)
    recovered.append(claudeSession)

    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([
      ptyBinding,
      claudeSession
    ])
  })

  it('keeps sequence numbers monotonic across a reload so compaction stays correct', () => {
    const first = new PersistenceDurabilityJournal(dataFile)
    first.append(ptyBinding)
    first.append(claudeSession)
    expect(first.watermark()).toBe(2)

    const reloaded = new PersistenceDurabilityJournal(dataFile)
    reloaded.readPending()
    reloaded.append(ptyBinding)

    expect(reloaded.watermark()).toBe(3)
  })

  it('compacts entries covered by a write while preserving later ones', () => {
    const journal = new PersistenceDurabilityJournal(dataFile)
    journal.append(ptyBinding)
    const watermark = journal.watermark()
    // Appended during the write's awaits — must survive.
    journal.append(claudeSession)

    journal.compactTo(watermark)

    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([claudeSession])
  })

  it('empties the journal when every entry is covered', () => {
    const journal = new PersistenceDurabilityJournal(dataFile)
    journal.append(ptyBinding)
    journal.append(claudeSession)

    journal.compactTo(journal.watermark())

    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([])
    expect(journal.byteLength()).toBe(0)
  })

  it('ignores records written by a future schema version', () => {
    writeFileSync(
      journalFile,
      `\n${JSON.stringify({
        v: DURABILITY_JOURNAL_VERSION + 1,
        seq: 1,
        at: 0,
        record: ptyBinding
      })}`,
      'utf-8'
    )

    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([])
  })

  it('ignores a line whose record is not a known op', () => {
    writeFileSync(
      journalFile,
      `\n${JSON.stringify({
        v: DURABILITY_JOURNAL_VERSION,
        seq: 1,
        at: 0,
        record: { op: 'not-a-real-op' }
      })}`,
      'utf-8'
    )

    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([])
  })

  it('reports no pending records when the journal file was never created', () => {
    expect(new PersistenceDurabilityJournal(dataFile).readPending()).toEqual([])
  })

  it('writes far fewer bytes than a full-state payload would', () => {
    const journal = new PersistenceDurabilityJournal(dataFile)
    journal.append(ptyBinding)

    // The regression this module exists to prevent: a spawn paying O(state) bytes.
    expect(readFileSync(journalFile, 'utf-8').length).toBeLessThan(512)
  })
})
