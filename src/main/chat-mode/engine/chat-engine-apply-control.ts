// The permission control protocol: can_use_tool requests become pending
// approvals, questions or plans, and leave when answered or voided.

import type { ChatEnginePending } from '../../../shared/chat-engine-types'
import type { ChatEngineThread } from './chat-engine-thread'
import { asRecord, asString, type Rec } from './chat-engine-records'

function pendingKind(toolName: string): ChatEnginePending['kind'] {
  if (toolName === 'AskUserQuestion') {
    return 'question'
  }
  return toolName === 'ExitPlanMode' ? 'plan' : 'permission'
}

export function applyControlRequest(thread: ChatEngineThread, record: Rec): void {
  const request = asRecord(record.request)
  const requestId = asString(record.request_id)
  const toolName = asString(request?.tool_name)
  if (!request || request.subtype !== 'can_use_tool' || !requestId || !toolName) {
    return
  }
  const toolUseId = asString(request.tool_use_id)
  const pending: ChatEnginePending = {
    requestId,
    kind: pendingKind(toolName),
    toolName,
    toolUseId,
    input: request.input,
    title: asString(request.title) ?? asString(request.display_name),
    description: asString(request.description),
    decisionReason: asString(request.decision_reason),
    blockedPath: asString(request.blocked_path),
    suggestions: Array.isArray(request.permission_suggestions) ? request.permission_suggestions : []
  }
  const meta = thread.getMeta()
  thread.setMeta({
    pending: [...meta.pending.filter((entry) => entry.requestId !== requestId), pending]
  })
  if (toolUseId) {
    thread.updateItemAnywhere(toolUseId, (item) =>
      item.kind === 'tool' ? { ...item, status: 'awaiting-approval' } : item
    )
  }
}

/** Drop a pending request once answered (by us) or voided (by the CLI). */
export function resolvePending(
  thread: ChatEngineThread,
  requestId: string,
  outcome: 'allowed' | 'denied' | 'cancelled'
): ChatEnginePending | null {
  const meta = thread.getMeta()
  const pending = meta.pending.find((entry) => entry.requestId === requestId) ?? null
  if (!pending) {
    return null
  }
  thread.setMeta({ pending: meta.pending.filter((entry) => entry.requestId !== requestId) })
  if (pending.toolUseId) {
    thread.updateItemAnywhere(pending.toolUseId, (item) => {
      if (item.kind !== 'tool') {
        return item
      }
      const status =
        outcome === 'allowed' ? 'running' : outcome === 'denied' ? 'denied' : 'interrupted'
      return { ...item, status }
    })
  }
  return pending
}
