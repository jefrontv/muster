// Rebuilds a thread model from Claude Code's JSONL transcript, for threads with
// no engine snapshot (made before the engine existed, or continued elsewhere).
// Transcript records are the stream's records minus the partials, so the same
// reducer applies once the few naming differences are mapped.

import { createReadStream } from 'node:fs'
import type { ChatEngineSnapshot } from '../../../shared/chat-engine-types'
import { applyChatEngineRecord } from './chat-engine-apply'
import { asRecord, type Rec } from './chat-engine-records'
import { ChatEngineThread } from './chat-engine-thread'

/** The stream-shaped record a transcript line stands for, or null to skip it. */
export function transcriptRecordToStream(record: Rec): Rec | null {
  if (record.isSidechain === true) {
    return null
  }
  switch (record.type) {
    case 'assistant':
      return record
    case 'user':
      // Compaction summaries are model input, not something the user wrote.
      if (record.isCompactSummary === true || record.isVisibleInTranscriptOnly === true) {
        return null
      }
      return record.toolUseResult === undefined
        ? record
        : { ...record, tool_use_result: record.toolUseResult }
    case 'system':
      // The transcript has no `result` records; turn_duration marks the same boundary.
      if (record.subtype === 'turn_duration') {
        return { type: 'result', subtype: 'success', duration_ms: record.durationMs }
      }
      return record.subtype === 'compact_boundary' || record.subtype === 'informational'
        ? record
        : null
    default:
      return null
  }
}

function recordTime(record: Rec, fallback: number): number {
  const parsed = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function hydrateChatEngineFromTranscript(
  threadId: string,
  transcriptPath: string,
  now: number
): Promise<ChatEngineSnapshot | null> {
  const thread = new ChatEngineThread(threadId)
  let applied = 0
  let last = now
  let pending = ''
  const consume = (line: string): void => {
    if (!line.startsWith('{')) {
      return
    }
    let parsed: Rec | null
    try {
      parsed = asRecord(JSON.parse(line))
    } catch {
      return
    }
    const record = parsed ? transcriptRecordToStream(parsed) : null
    if (record) {
      last = recordTime(parsed ?? record, last)
      applyChatEngineRecord(thread, record, last)
      applied += 1
    }
  }
  try {
    for await (const chunk of createReadStream(transcriptPath, { encoding: 'utf-8' })) {
      pending += chunk as string
      let newline = pending.indexOf('\n')
      while (newline !== -1) {
        consume(pending.slice(0, newline).trim())
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
      }
    }
    consume(pending.trim())
  } catch {
    return null
  }
  if (applied === 0) {
    return null
  }
  // Older CLIs wrote no turn_duration, so an open last turn is usually a finished one.
  thread.endRunningTurns({ now: last, status: 'done' })
  thread.setMeta({ status: 'idle', pending: [] })
  thread.takePatch()
  return thread.snapshot()
}
