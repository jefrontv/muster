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
 *  envelope and its caveat are dropped — terminal chrome, the composer already
 *  echoes what was typed — but stdout is the command's only feedback in chat
 *  threads (no TUI), so it surfaces as a quiet system line. */
function isClaudeLocalCommandRecord(text: string): boolean {
  return (
    text.startsWith('<local-command-caveat>') || /<command-name>[^<]*<\/command-name>/.test(text)
  )
}

const LOCAL_COMMAND_STDOUT = /^<local-command-stdout>([\s\S]*?)<\/local-command-stdout>$/
const LOCAL_COMMAND_STDOUT_MAX = 400

/** The `<local-command-stdout>` payload as a system status line, or null when
 *  empty. Long payloads (hook spam) truncate — this is feedback, not a log. */
function claudeCommandStdoutMessage(
  text: string,
  id: string,
  timestamp: number | null
): NativeChatMessage | null {
  const inner = LOCAL_COMMAND_STDOUT.exec(text.trim())?.[1]?.trim()
  if (inner === undefined) {
    return null
  }
  if (inner === '') {
    return null
  }
  const bounded =
    inner.length > LOCAL_COMMAND_STDOUT_MAX ? `${inner.slice(0, LOCAL_COMMAND_STDOUT_MAX)}…` : inner
  return {
    id,
    role: 'system',
    blocks: [{ type: 'text', text: bounded }],
    timestamp,
    source: 'transcript'
  }
}

/** `type: "system"` records: slash-command echoes/output and compact markers.
 *  Everything else system-typed stays dropped. */
function decodeClaudeSystemRecord(
  record: Record<string, unknown>,
  fallbackId: string
): NativeChatMessage | null {
  const id = extractString(record.uuid) ?? fallbackId
  const timestamp = parseTimestamp(record.timestamp)
  const content = typeof record.content === 'string' ? record.content : null
  if (record.subtype === 'compact_boundary') {
    return {
      id,
      role: 'system',
      blocks: [{ type: 'text', text: content?.trim() || 'Conversation compacted' }],
      timestamp,
      source: 'transcript'
    }
  }
  if (record.subtype !== 'local_command' || content === null) {
    return null
  }
  const stdout = claudeCommandStdoutMessage(content, id, timestamp)
  if (stdout) {
    return stdout
  }
  // The command echo itself — render as the user turn it was, so the thread's
  // optimistic "/x" bubble reconciles instead of orphaning on reload.
  if (content.startsWith('/')) {
    return {
      id,
      role: 'user',
      blocks: [{ type: 'text', text: content }],
      timestamp,
      source: 'transcript'
    }
  }
  return null
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
  if (role === 'system') {
    return decodeClaudeSystemRecord(record, fallbackId)
  }
  if (role !== 'user' && role !== 'assistant') {
    return null
  }
  const timestamp = parseTimestamp(record.timestamp)
  const recordMessageId = extractString(record.uuid) ?? fallbackId
  if (role === 'user') {
    const rawText = claudeUserRecordText(asRecord(record.message))
    if (rawText && isClaudeLocalCommandRecord(rawText)) {
      return null
    }
    // Older harness shape: stdout arrives as a user record, not a system one.
    if (rawText?.trimStart().startsWith('<local-command-stdout>')) {
      return claudeCommandStdoutMessage(rawText, recordMessageId, timestamp)
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
