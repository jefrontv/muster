// One Code mode turn's replies, reasoning, notices and tool calls as chat-engine items.

import type {
  ChatEngineItem,
  ChatEngineToolResult,
  ChatEngineToolStatus
} from '../../../../shared/chat-engine-types'
import type { NativeChatTranscriptAgent } from '../../../../shared/native-chat-agent-support'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'
import { pairToolBlocks, type NativeChatToolPair } from '../../../../shared/native-chat-tool-fold'
import {
  isTextBlock,
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatBlock,
  type NativeChatMessage,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../../../../shared/native-chat-types'
import {
  codexCommandOutput,
  nativeChatEngineToolCalls,
  type NativeChatEngineToolCall
} from './native-chat-engine-tool-names'

export type NativeChatEngineTurnGroup = {
  id: string
  user: NativeChatMessage | null
  messages: NativeChatMessage[]
}

export type NativeChatEngineTurnContext = {
  agent: NativeChatTranscriptAgent | null
  live: boolean
  interrupted: boolean
  timestamps: Map<NativeChatBlock, number | null>
}

const SUMMARY_CHARS = 200

export const isInterruptStatusMessage = (message: NativeChatMessage): boolean =>
  message.role === 'system' &&
  message.blocks.some(
    (block) => isTextBlock(block) && block.text === NATIVE_CHAT_INTERRUPTED_STATUS_TEXT
  )

function toolResult(
  agent: NativeChatTranscriptAgent | null,
  name: string,
  block: NativeChatToolResultBlock
): { result: ChatEngineToolResult; isError: boolean } {
  const detail = block.detail ?? {}
  const command = agent === 'codex' && name === 'Bash' ? codexCommandOutput(block.output) : null
  const exitFailed = command?.exitCode != null && command.exitCode !== 0
  const isError = block.isError === true || exitFailed
  const result: ChatEngineToolResult = {
    // Bash reads the exit code from this line, as Claude writes it.
    text: exitFailed ? `Exit code ${command.exitCode}\n${command.stdout}` : block.output,
    isError,
    truncated: detail.truncated === true,
    ...(detail.patch ? { patch: detail.patch } : {}),
    ...(detail.created !== undefined ? { created: detail.created } : {}),
    ...(detail.additions !== undefined ? { additions: detail.additions } : {}),
    ...(detail.deletions !== undefined ? { deletions: detail.deletions } : {}),
    ...(command
      ? { stdout: command.stdout }
      : detail.stdout !== undefined
        ? { stdout: detail.stdout }
        : {}),
    ...(detail.stderr !== undefined ? { stderr: detail.stderr } : {}),
    ...(detail.interrupted !== undefined ? { interrupted: detail.interrupted } : {})
  }
  return { result, isError }
}

function firstLine(text: string): string | null {
  const line =
    text
      .split('\n')
      .find((entry) => entry.trim() !== '')
      ?.trim() ?? ''
  if (line === '') {
    return null
  }
  return line.length > SUMMARY_CHARS ? `${line.slice(0, SUMMARY_CHARS - 1)}…` : line
}

function toolItems(
  pair: NativeChatToolPair & { call: NativeChatToolCallBlock },
  fallbackId: string,
  context: NativeChatEngineTurnContext
): ChatEngineItem[] {
  const { call, result } = pair
  const id = call.id ?? fallbackId
  const pending: ChatEngineToolStatus = context.live
    ? 'running'
    : context.interrupted
      ? 'interrupted'
      : 'done'
  const startedAt = context.timestamps.get(call) ?? null
  const endedAt = result ? (context.timestamps.get(result) ?? null) : null
  const elapsed =
    startedAt !== null && endedAt !== null && endedAt - startedAt >= 1_000
      ? { elapsedSeconds: (endedAt - startedAt) / 1_000 }
      : {}
  const mapped = nativeChatEngineToolCalls(context.agent, call.name, call.input)
  return mapped.map((entry: NativeChatEngineToolCall): ChatEngineItem => {
    const itemId = entry.part === undefined ? id : `${id}:${entry.part}`
    if (entry.name === 'Task' || entry.name === 'Agent') {
      const fields = (entry.input && typeof entry.input === 'object' ? entry.input : {}) as Record<
        string,
        unknown
      >
      return {
        kind: 'agent',
        id: itemId,
        description: typeof fields.description === 'string' ? fields.description : '',
        subagentType: typeof fields.subagent_type === 'string' ? fields.subagent_type : null,
        status: result
          ? result.isError
            ? 'error'
            : 'done'
          : pending === 'running'
            ? 'running'
            : 'stopped',
        summary: result ? firstLine(result.output) : null,
        items: []
      }
    }
    const answered = result ? toolResult(context.agent, entry.name, result) : null
    return {
      kind: 'tool',
      id: itemId,
      name: entry.name,
      input: entry.input,
      status: answered ? (answered.isError ? 'error' : 'done') : pending,
      ...(answered ? { result: answered.result } : {}),
      ...elapsed
    }
  })
}

export function nativeChatEngineTurnItems(
  group: NativeChatEngineTurnGroup,
  context: NativeChatEngineTurnContext
): ChatEngineItem[] {
  const blocks: NativeChatBlock[] = []
  for (const message of [...(group.user ? [group.user] : []), ...group.messages]) {
    for (const block of message.blocks) {
      if (block.type === 'tool-call' || block.type === 'tool-result') {
        blocks.push(block)
        context.timestamps.set(block, message.timestamp)
      }
    }
  }
  const callIds = new Set(
    blocks.flatMap((block) => (block.type === 'tool-call' && block.id ? [block.id] : []))
  )
  const answersById = (block: NativeChatBlock): boolean =>
    block.type === 'tool-result' && block.toolUseId !== undefined && callIds.has(block.toolUseId)
  // Equal timestamps sort a result ahead of its call, so id-matched results pair last.
  const pairs = pairToolBlocks([
    ...blocks.filter((block) => !answersById(block)),
    ...blocks.filter(answersById)
  ])
  const pairByCall = new Map(pairs.flatMap((pair) => (pair.call ? [[pair.call, pair]] : [])))
  const items: ChatEngineItem[] = []
  // Replies key by their slot, so the transcript copy replaces the streaming preview in place.
  let textSlot = 0
  for (const message of group.messages) {
    if (isInterruptStatusMessage(message)) {
      continue
    }
    const prose = message.blocks
      .filter(isTextBlock)
      .map((block) => block.text)
      .join('\n\n')
    if (message.role === 'reasoning') {
      if (prose.trim() !== '') {
        items.push({
          kind: 'thinking',
          id: `thinking:${message.id}`,
          text: prose,
          streaming: false
        })
      }
      continue
    }
    if (message.role === 'system') {
      if (prose.trim() !== '') {
        items.push({
          kind: 'notice',
          id: `notice:${message.id}`,
          level: 'info',
          text: prose.trim()
        })
      }
      continue
    }
    if (prose.trim() !== '') {
      items.push({
        kind: 'text',
        id: `${group.id}:text:${textSlot++}`,
        text: prose,
        streaming: message.id === NATIVE_CHAT_STREAMING_ID
      })
    }
    message.blocks.forEach((block, index) => {
      if (block.type !== 'tool-call') {
        return
      }
      const pair = pairByCall.get(block) ?? { call: block }
      items.push(...toolItems({ ...pair, call: block }, `${message.id}:tool:${index}`, context))
    })
  }
  return items
}
