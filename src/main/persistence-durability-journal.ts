// Append-only NDJSON durability journal for crash-critical state mutations.
//
// Why this exists: the durable state lives in one multi-MB orca-data.json. Paths
// that must survive a SIGKILL (pty spawn bindings, issue #217) used to call the
// sync full-state flush, paying a whole-state stringify + writeFileSync on the
// main thread for every spawn. This journal records the *intent* of those
// mutations as ~100-byte lines instead, so durability costs O(entry) not
// O(state). The debounced async full-state write remains the convergence path;
// once it lands, journal entries it already covers are compacted away.
//
// Two hard constraints (note the first inverts daemon-file-log.ts):
//   1. FAIL-CLOSED. This IS the durability barrier — callers treat a successful
//      return as "the mutation will survive a crash". Errors MUST propagate so
//      the caller can roll back, exactly as the sync flush did.
//   2. Torn-tail safe. Each record is one synchronous appendFileSync prefixed
//      with a newline, so a process death mid-append can only corrupt its own
//      trailing line — it can never merge into and swallow the next record.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SshRemotePtyLease } from '../shared/ssh-types'

export const DURABILITY_JOURNAL_VERSION = 1

/** Beyond this the journal has stopped converging (full writes failing/frozen);
 *  the Store forces a full sync write rather than replaying an unbounded file. */
export const DURABILITY_JOURNAL_MAX_BYTES = 1024 * 1024

export type PtyBindingJournalArgs = {
  worktreeId: string
  tabId: string
  leafId: string
  ptyId: string
  incarnationId?: string
  startupCwd?: string
}

/** Each record names a mutation that is a pure function of its payload plus
 *  prior state, so replay is just re-invoking the same Store mutator. */
export type DurabilityJournalRecord =
  | { op: 'pty-binding'; args: PtyBindingJournalArgs; hostId: string | null }
  | { op: 'claude-live-pty-session'; sessionId: string }
  | { op: 'ssh-lease-upsert'; lease: SshRemotePtyLease }

type JournalLine = {
  v: number
  seq: number
  at: number
  record: DurabilityJournalRecord
}

export function getDurabilityJournalFile(dataFile: string): string {
  return join(dirname(dataFile), 'orca-data-journal.ndjson')
}

function isRecordShape(value: unknown): value is DurabilityJournalRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const op = (value as { op?: unknown }).op
  return op === 'pty-binding' || op === 'claude-live-pty-session' || op === 'ssh-lease-upsert'
}

function parseLine(line: string): JournalLine | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Torn tail from a killed process, or a partial line. Skip it.
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const { v, seq, at, record } = parsed as Partial<JournalLine>
  if (v !== DURABILITY_JOURNAL_VERSION || typeof seq !== 'number' || !isRecordShape(record)) {
    return null
  }
  return { v, seq, at: typeof at === 'number' ? at : 0, record }
}

export class PersistenceDurabilityJournal {
  private readonly journalFile: string
  private seq = 0
  private bytes = 0

  constructor(dataFile: string) {
    this.journalFile = getDurabilityJournalFile(dataFile)
    this.bytes = this.readRawSize()
  }

  private readRawSize(): number {
    try {
      return existsSync(this.journalFile) ? readFileSync(this.journalFile).byteLength : 0
    } catch {
      return 0
    }
  }

  /** Current high-water sequence. Capture before a full-state write so entries
   *  appended during that write's awaits survive compaction. */
  watermark(): number {
    return this.seq
  }

  byteLength(): number {
    return this.bytes
  }

  /** Append one record. Throws on failure — the caller's rollback depends on it. */
  append(record: DurabilityJournalRecord): void {
    const line: JournalLine = {
      v: DURABILITY_JOURNAL_VERSION,
      seq: this.seq + 1,
      at: Date.now(),
      record
    }
    // Leading newline: a torn previous line can then never absorb this record.
    const payload = `\n${JSON.stringify(line)}`
    const dir = dirname(this.journalFile)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    appendFileSync(this.journalFile, payload, 'utf-8')
    this.seq = line.seq
    this.bytes += Buffer.byteLength(payload, 'utf-8')
  }

  /** Records not yet known to be covered by a durable full-state write.
   *  Unparseable lines are skipped (see torn-tail constraint). */
  readPending(): DurabilityJournalRecord[] {
    let raw: string
    try {
      raw = readFileSync(this.journalFile, 'utf-8')
    } catch {
      return []
    }
    const lines: JournalLine[] = []
    for (const rawLine of raw.split('\n')) {
      const parsed = parseLine(rawLine)
      if (parsed) {
        lines.push(parsed)
      }
    }
    lines.sort((a, b) => a.seq - b.seq)
    // Adopt the recovered high-water mark so post-load appends stay monotonic.
    const highest = lines.at(-1)?.seq ?? 0
    if (highest > this.seq) {
      this.seq = highest
    }
    return lines.map((line) => line.record)
  }

  /** Drop entries at or below `seq` — they are covered by a landed full write.
   *  Entries appended during that write (seq > watermark) are preserved. */
  compactTo(seq: number): void {
    let raw: string
    try {
      raw = readFileSync(this.journalFile, 'utf-8')
    } catch {
      return
    }
    const survivors: string[] = []
    for (const rawLine of raw.split('\n')) {
      const parsed = parseLine(rawLine)
      if (parsed && parsed.seq > seq) {
        survivors.push(JSON.stringify(parsed))
      }
    }
    this.writeAll(survivors)
  }

  clear(): void {
    this.writeAll([])
  }

  private writeAll(lines: string[]): void {
    const payload = lines.length > 0 ? `\n${lines.join('\n')}` : ''
    try {
      const dir = dirname(this.journalFile)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.journalFile, payload, 'utf-8')
      this.bytes = Buffer.byteLength(payload, 'utf-8')
    } catch {
      // Compaction is best-effort: a stale entry replays as an idempotent
      // re-apply of state the full write already holds, which is harmless.
    }
  }
}
