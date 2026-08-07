// Claude JSONL line → NativeChatMessage decoder.

import {
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatBlock,
  type NativeChatMessage
} from '../../shared/native-chat-types'
import {
  asRecord,
  extractString,
  parseJsonObject,
  timestampMs
} from '../ai-vault/session-scanner-values'
import { claudeContentBlocks } from './transcript-record-blocks'
import { claudeInterruptedMessageId } from './transcript-turn-markers'

/** Raw text of a user record whose content is a plain string or a single text block. */
function claudeUserRecordText(message: Record<string, unknown> | null): string | null {
  const content = message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content) && content.length === 1) {
    const only = asRecord(content[0])
    if (only?.type === 'text' && typeof only.text === 'string') {
      return only.text
    }
  }
  return null
}

/** Local slash-command bookkeeping Claude writes into the transcript. The command
 *  itself becomes a quiet "Ran /model sonnet" status; its caveat and stdout echo
 *  are dropped — they are terminal chrome, not conversation turns. */
function claudeLocalCommandStatus(text: string): { status: string } | 'drop' | null {
  if (text.startsWith('<local-command-caveat>') || text.startsWith('<local-command-stdout>')) {
    return 'drop'
  }
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]?.trim()
  if (!name) {
    return null
  }
  const args = /<command-args>([^<]*)<\/command-args>/.exec(text)?.[1]?.trim()
  return { status: `Ran ${name}${args ? ` ${args}` : ''}` }
}

export function decodeClaudeTranscriptLine(
  line: string,
  fallbackId: string
): NativeChatMessage | null {
  const record = parseJsonObject(line)
  if (!record) {
    return null
  }
  const role = record.type
  if (role !== 'user' && role !== 'assistant') {
    return null
  }
  const timestamp = parseTimestamp(record.timestamp)
  const recordMessageId = extractString(record.uuid) ?? fallbackId
  if (role === 'user') {
    const rawText = claudeUserRecordText(asRecord(record.message))
    const command = rawText ? claudeLocalCommandStatus(rawText) : null
    if (command === 'drop') {
      return null
    }
    if (command) {
      return {
        id: recordMessageId,
        role: 'system',
        blocks: [{ type: 'text', text: command.status }],
        timestamp,
        source: 'transcript'
      }
    }
  }
  if (claudeInterruptedMessageId(record)) {
    // Why: keep Claude's injected boilerplate out of the user-bubble path while
    // preserving the interruption as a quiet, replayable conversation status.
    return {
      id: recordMessageId,
      role: 'system',
      blocks: [{ type: 'text', text: NATIVE_CHAT_INTERRUPTED_STATUS_TEXT }],
      timestamp,
      source: 'transcript'
    }
  }
  const message = asRecord(record.message)
  const decodedBlocks = claudeContentBlocks(message?.content)
  if (decodedBlocks.length === 0) {
    return null
  }
  // Why: Claude structurally marks injected turns, but tool-result records are
  // genuine output and must remain visible even when the containing turn is meta.
  const isInjectedUserTurn =
    role === 'user' &&
    (record.isMeta === true || record.isSynthetic === true || record.isCompactSummary === true)
  const blocks = isInjectedUserTurn
    ? decodedBlocks.filter((block) => block.type === 'tool-result')
    : decodedBlocks
  if (blocks.length === 0) {
    return null
  }
  const messageId = extractString(record.uuid) ?? extractString(message?.id)
  return {
    id: messageId ?? fallbackId,
    role: claudeMessageRole(role, blocks),
    blocks,
    timestamp,
    source: 'transcript'
  }
}

// Claude marks reasoning via `thinking` content blocks; when a message is made
// up solely of reasoning, surface it as a reasoning-role message.
function claudeMessageRole(
  role: 'user' | 'assistant',
  blocks: NativeChatBlock[]
): NativeChatMessage['role'] {
  if (role === 'user') {
    const onlyToolResults = blocks.every((block) => block.type === 'tool-result')
    return onlyToolResults && blocks.length > 0 ? 'tool' : 'user'
  }
  return role
}

function parseTimestamp(value: unknown): number | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? parsed : null
}
