// Entry point for one parsed stream-json (or transcript) record.

import type { ChatEngineThread } from './chat-engine-thread'
import { applyAssistantRecord, applyStreamEvent } from './chat-engine-apply-assistant'
import { applyEventRecord } from './chat-engine-apply-events'
import type { Rec } from './chat-engine-records'

export function applyChatEngineRecord(thread: ChatEngineThread, record: Rec, now: number): void {
  if (record.type === 'stream_event') {
    applyStreamEvent(thread, record, now)
  } else if (record.type === 'assistant') {
    applyAssistantRecord(thread, record, now)
  } else {
    applyEventRecord(thread, record, now)
  }
  thread.refreshStatus()
}
