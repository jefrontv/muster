// User records: tool results (matched to their tool items by id) and replayed
// user turns (matched to the local turn that sent them).

import type { ChatEngineThread } from './chat-engine-thread'
import { asRecord, asString, type Rec } from './chat-engine-records'
import { buildToolResult, toolResultText } from './chat-engine-tool-result'

/** Claude Code's marker for a turn the user stopped ("[Request interrupted by user for tool use]"). */
const INTERRUPTED = /^\[Request interrupted by user/

/** User text that is really Claude Code plumbing (command echoes, reminders). */
function isPlumbing(text: string): boolean {
  const trimmed = text.trim()
  return (
    trimmed.startsWith('<') &&
    /^<(command-|local-command-|system-reminder|user-memory-input)/.test(trimmed)
  )
}

export function applyUserRecord(thread: ChatEngineThread, record: Rec, now: number): void {
  const message = asRecord(record.message)
  const content = message?.content
  const blocks = Array.isArray(content)
    ? content.map(asRecord).filter((b): b is Rec => b !== null)
    : []

  const toolResults = blocks.filter((block) => block.type === 'tool_result')
  if (toolResults.length > 0) {
    for (const block of toolResults) {
      const toolUseId = asString(block.tool_use_id)
      if (!toolUseId) {
        continue
      }
      const isError = block.is_error === true
      const result = buildToolResult({
        content: block.content,
        isError,
        structured: toolResults.length === 1 ? record.tool_use_result : undefined
      })
      thread.updateItemAnywhere(toolUseId, (item) => {
        if (item.kind === 'tool') {
          const status = item.status === 'denied' ? 'denied' : isError ? 'error' : 'done'
          return { ...item, status, result }
        }
        if (item.kind === 'agent') {
          const firstLine = toolResultText(block.content)
            .split('\n')
            .find((line) => line.trim() !== '')
          return {
            ...item,
            status: isError ? 'error' : 'done',
            summary: item.summary ?? firstLine?.slice(0, 300) ?? null
          }
        }
        return item
      })
    }
    return
  }

  // Subagent prompts and synthetic messages are not the user's turns.
  if (
    asString(record.parent_tool_use_id) ||
    record.isSynthetic === true ||
    record.isMeta === true
  ) {
    return
  }
  const text =
    typeof content === 'string'
      ? content
      : blocks
          .filter((block) => block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text as string)
          .join('\n')
  if (text.trim() === '' && !blocks.some((block) => block.type === 'image')) {
    return
  }
  if (isPlumbing(text)) {
    return
  }
  if (INTERRUPTED.test(text) || asString(record.interruptedMessageId)) {
    thread.endRunningTurns({ now, status: 'interrupted' })
    return
  }
  const uuid = asString(record.uuid)
  if (uuid && thread.markDelivered(uuid)) {
    return
  }
  const awaiting = thread.turnAwaitingDelivery()
  if (awaiting?.user) {
    thread.replaceTurn({ ...awaiting, user: { ...awaiting.user, delivery: 'delivered', uuid } })
    return
  }
  // Not sent from this engine (resumed history, or another client): start a turn for it.
  const turn = thread.beginUserTurn({
    text,
    imageCount: blocks.filter((block) => block.type === 'image').length,
    now
  })
  if (turn.user) {
    thread.replaceTurn({ ...turn, user: { ...turn.user, delivery: 'delivered', uuid } })
  }
}
