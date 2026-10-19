// Assistant output: `stream_event` partials (text, thinking and tool-input deltas)
// and the final `assistant` records. Partials create items early so the UI can
// draw a tool the moment it starts; final records are authoritative.

import type { ChatEngineItem } from '../../../shared/chat-engine-types'
import type { ChatEngineThread } from './chat-engine-thread'
import { appendItem, findItem } from './chat-engine-tree'
import { asRecord, type Rec } from './chat-engine-records'

const AGENT_TOOL_NAMES = new Set(['Agent', 'Task'])

function parentOf(record: Rec): string | null {
  return typeof record.parent_tool_use_id === 'string' && record.parent_tool_use_id !== ''
    ? record.parent_tool_use_id
    : null
}

function newToolItem(id: string, name: string, input: unknown, streaming: boolean): ChatEngineItem {
  if (AGENT_TOOL_NAMES.has(name)) {
    const fields = asRecord(input)
    return {
      kind: 'agent',
      id,
      description: typeof fields?.description === 'string' ? fields.description : '',
      subagentType: typeof fields?.subagent_type === 'string' ? fields.subagent_type : null,
      status: 'running',
      summary: null,
      items: []
    }
  }
  return { kind: 'tool', id, name, input, status: streaming ? 'streaming' : 'running' }
}

/** Insert or update one item in the running turn, under its subagent when it has one. */
function upsertItem(
  thread: ChatEngineThread,
  now: number,
  parent: string | null,
  id: string,
  create: () => ChatEngineItem,
  update: (item: ChatEngineItem) => ChatEngineItem
): void {
  if (thread.updateItemAnywhere(id, update)) {
    return
  }
  const turn = thread.currentTurn(now)
  const parentTurn = parent ? (thread.turnWithItem(parent) ?? turn) : turn
  thread.replaceTurn(appendItem(parentTurn, create(), parent))
}

function recordTodos(thread: ChatEngineThread, name: string, input: unknown): void {
  const todos = asRecord(input)?.todos
  if (name !== 'TodoWrite' || !Array.isArray(todos)) {
    return
  }
  thread.setMeta({
    todos: todos.flatMap((entry) => {
      const todo = asRecord(entry)
      if (!todo || typeof todo.content !== 'string') {
        return []
      }
      const status =
        todo.status === 'completed' || todo.status === 'in_progress' ? todo.status : 'pending'
      return [
        {
          content: todo.content,
          activeForm: typeof todo.activeForm === 'string' ? todo.activeForm : todo.content,
          status
        }
      ]
    })
  })
}

export function applyStreamEvent(thread: ChatEngineThread, record: Rec, now: number): void {
  const event = asRecord(record.event)
  if (!event) {
    return
  }
  const parent = parentOf(record)
  const parentKey = parent ?? '_'
  switch (event.type) {
    case 'message_start': {
      const id = asRecord(event.message)?.id
      if (typeof id === 'string') {
        thread.streamMessageIds.set(parentKey, id)
      }
      return
    }
    case 'content_block_start': {
      const block = asRecord(event.content_block)
      const index = typeof event.index === 'number' ? event.index : null
      const messageId = thread.streamMessageIds.get(parentKey)
      if (!block || index === null || !messageId) {
        return
      }
      const key = `${parentKey}|${index}`
      if (
        block.type === 'tool_use' &&
        typeof block.id === 'string' &&
        typeof block.name === 'string'
      ) {
        const toolId = block.id
        const name = block.name
        thread.streamBlocks.set(key, toolId)
        upsertItem(
          thread,
          now,
          parent,
          toolId,
          () => newToolItem(toolId, name, {}, true),
          (item) => item
        )
      } else if (block.type === 'text' || block.type === 'thinking') {
        const itemId = `${messageId}#${index}`
        const kind = block.type
        thread.streamBlocks.set(key, itemId)
        upsertItem(
          thread,
          now,
          parent,
          itemId,
          () => ({ kind, id: itemId, text: '', streaming: true }),
          (item) => item
        )
      }
      return
    }
    case 'content_block_delta': {
      const index = typeof event.index === 'number' ? event.index : null
      const itemId = index === null ? undefined : thread.streamBlocks.get(`${parentKey}|${index}`)
      const delta = asRecord(event.delta)
      if (!itemId || !delta) {
        return
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        thread.toolInputJson.set(
          itemId,
          (thread.toolInputJson.get(itemId) ?? '') + delta.partial_json
        )
        return
      }
      const chunk =
        delta.type === 'text_delta'
          ? delta.text
          : delta.type === 'thinking_delta'
            ? delta.thinking
            : null
      if (typeof chunk !== 'string' || chunk === '') {
        return
      }
      thread.updateItemAnywhere(itemId, (item) =>
        item.kind === 'text' || item.kind === 'thinking'
          ? { ...item, text: item.text + chunk }
          : item
      )
      return
    }
    case 'content_block_stop': {
      const index = typeof event.index === 'number' ? event.index : null
      const itemId = index === null ? undefined : thread.streamBlocks.get(`${parentKey}|${index}`)
      if (!itemId) {
        return
      }
      const json = thread.toolInputJson.get(itemId)
      thread.toolInputJson.delete(itemId)
      let input: unknown
      if (json) {
        try {
          input = JSON.parse(json)
        } catch {
          input = undefined
        }
      }
      thread.updateItemAnywhere(itemId, (item) => {
        if (item.kind === 'tool') {
          // Newer CLIs send the final record before this stop; its input wins over the partials.
          return item.status === 'streaming'
            ? { ...item, ...(input !== undefined ? { input } : {}), status: 'running' }
            : item
        }
        return item.kind === 'text' || item.kind === 'thinking'
          ? { ...item, streaming: false }
          : item
      })
      return
    }
    default:
      break
  }
}

export function applyAssistantRecord(thread: ChatEngineThread, record: Rec, now: number): void {
  const message = asRecord(record.message)
  const content = Array.isArray(message?.content) ? message.content : []
  const messageId = typeof message?.id === 'string' ? message.id : `anon-${now}`
  const parent = parentOf(record)
  // Claude Code writes one block per record and tags it with its API index, which
  // is the same index the stream partials used; count only when it is missing.
  const apiBlockIndex =
    content.length === 1 && typeof record.apiBlockIndex === 'number' ? record.apiBlockIndex : null
  for (const raw of content) {
    const block = asRecord(raw)
    if (!block) {
      continue
    }
    const ordinal = apiBlockIndex ?? thread.blockOrdinals.get(messageId) ?? 0
    thread.blockOrdinals.set(
      messageId,
      Math.max(ordinal + 1, thread.blockOrdinals.get(messageId) ?? 0)
    )
    if ((block.type === 'text' && typeof block.text === 'string') || block.type === 'thinking') {
      const kind = block.type === 'text' ? 'text' : 'thinking'
      const text =
        typeof block.text === 'string'
          ? block.text
          : typeof block.thinking === 'string'
            ? block.thinking
            : ''
      if (kind === 'text' && text.trim() === '') {
        continue
      }
      const itemId = `${messageId}#${ordinal}`
      upsertItem(
        thread,
        now,
        parent,
        itemId,
        () => ({ kind, id: itemId, text, streaming: false }),
        (item) => (item.kind === kind ? { ...item, text, streaming: false } : item)
      )
    } else if (
      block.type === 'tool_use' &&
      typeof block.id === 'string' &&
      typeof block.name === 'string'
    ) {
      const toolId = block.id
      const name = block.name
      const input = block.input
      recordTodos(thread, name, input)
      upsertItem(
        thread,
        now,
        parent,
        toolId,
        () => newToolItem(toolId, name, input, false),
        (item) => {
          if (item.kind === 'tool') {
            return { ...item, input, status: item.status === 'streaming' ? 'running' : item.status }
          }
          if (item.kind === 'agent') {
            const fresh = newToolItem(toolId, name, input, false)
            return fresh.kind === 'agent'
              ? {
                  ...item,
                  description: item.description || fresh.description,
                  subagentType: item.subagentType ?? fresh.subagentType
                }
              : item
          }
          return item
        }
      )
    }
  }
  if (typeof record.error === 'string' && record.error !== '') {
    const turn = thread.currentTurn(now)
    if (!findItem(turn.items, `error-${messageId}`)) {
      thread.replaceTurn(
        appendItem(
          turn,
          { kind: 'notice', id: `error-${messageId}`, level: 'error', text: record.error },
          null
        )
      )
    }
  }
}
