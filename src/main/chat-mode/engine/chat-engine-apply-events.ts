// Dispatch for every record that is not assistant output, plus the small
// top-level ones: tool progress, tool-group summaries, suggestions and results.

import type { ChatEngineThread } from './chat-engine-thread'
import { applyUserRecord } from './chat-engine-apply-user'
import { applyControlRequest, resolvePending } from './chat-engine-apply-control'
import { applySystemRecord } from './chat-engine-apply-system'
import { asString, strings, type Rec } from './chat-engine-records'

const SUGGESTION_LIMIT = 3

export function applyEventRecord(thread: ChatEngineThread, record: Rec, now: number): void {
  switch (record.type) {
    case 'user':
      applyUserRecord(thread, record, now)
      return
    case 'system':
      applySystemRecord(thread, record, now)
      return
    case 'control_request':
      applyControlRequest(thread, record)
      return
    case 'control_cancel_request': {
      const requestId = asString(record.request_id)
      if (requestId) {
        resolvePending(thread, requestId, 'cancelled')
      }
      return
    }
    case 'tool_progress': {
      const toolUseId = asString(record.tool_use_id)
      const elapsed =
        typeof record.elapsed_time_seconds === 'number' ? record.elapsed_time_seconds : null
      if (toolUseId && elapsed !== null) {
        thread.updateItemAnywhere(toolUseId, (item) =>
          item.kind === 'tool' ? { ...item, elapsedSeconds: elapsed } : item
        )
      }
      return
    }
    case 'tool_use_summary': {
      const summary = asString(record.summary)
      const turn = thread.runningTurn()
      if (summary && turn) {
        thread.replaceTurn({ ...turn, toolSummaries: [...turn.toolSummaries, summary] })
      }
      return
    }
    case 'prompt_suggestion': {
      const suggestion = asString(record.suggestion)
      const current = thread.getMeta().suggestions
      if (suggestion && !current.includes(suggestion)) {
        thread.setMeta({ suggestions: [...current, suggestion].slice(-SUGGESTION_LIMIT) })
      }
      return
    }
    case 'result': {
      const isError = record.subtype !== 'success' || record.is_error === true
      const cost = typeof record.total_cost_usd === 'number' ? record.total_cost_usd : null
      const errors = strings(record.errors)
      const errorMessage = isError
        ? (asString(record.result) ?? errors[0] ?? asString(record.subtype) ?? 'The turn failed.')
        : null
      thread.endRunningTurns({
        now,
        status: isError ? 'error' : 'done',
        durationMs: typeof record.duration_ms === 'number' ? record.duration_ms : null,
        costUsd: cost,
        errorMessage
      })
      thread.setMeta({
        totalCostUsd: thread.getMeta().totalCostUsd + (cost ?? 0),
        lastError: errorMessage
      })
      return
    }
    default:
      break
  }
}
