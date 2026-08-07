// Turn grouping + fold derivation for the native chat timeline (T3 parity).
// A turn opens at a real user message; once settled, everything between the
// user message and the final assistant reply collapses behind a
// "Worked for {duration}" row. Pure so the rules are unit-testable.

import {
  isTextBlock,
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'

export type NativeChatTurn = {
  /** Stable turn key: the opening user message's id, or 'lead' for the
   *  boundary-less rows before the first user message. */
  id: string
  /** Opening user message; null only for the leading group. */
  userMessage: NativeChatMessage | null
  /** All of the turn's messages in timeline order (user message included). */
  messages: NativeChatMessage[]
}

export type NativeChatTurnFold = {
  turnId: string
  /** Rows hidden while the fold is collapsed. */
  hiddenMessageIds: ReadonlySet<string>
  /** Rows never rendered (the raw interrupt row — the fold label carries it). */
  droppedMessageIds: ReadonlySet<string>
  /** Last-message timestamp minus first-post-user timestamp; null when the
   *  turn has too few timestamps to measure. */
  durationMs: number | null
  interrupted: boolean
}

/** Concatenated text of a message's text blocks, trimmed. */
export function nativeChatMessageText(message: NativeChatMessage): string {
  return message.blocks
    .map((block) => (isTextBlock(block) ? block.text : ''))
    .join('')
    .trim()
}

/** Real turn boundaries only: the synthetic streaming bubble and optimistic
 *  scrape-source echoes are not transcript turns yet. */
export function isTurnBoundaryUserMessage(message: NativeChatMessage): boolean {
  return (
    message.role === 'user' &&
    message.id !== NATIVE_CHAT_STREAMING_ID &&
    message.source !== 'scrape'
  )
}

export function isInterruptStatusMessage(message: NativeChatMessage): boolean {
  return (
    message.role === 'system' &&
    message.blocks.some(
      (block) => isTextBlock(block) && block.text === NATIVE_CHAT_INTERRUPTED_STATUS_TEXT
    )
  )
}

/** Split the ordered message array into turns at user-message boundaries. */
export function groupNativeChatTurns(messages: readonly NativeChatMessage[]): NativeChatTurn[] {
  const turns: NativeChatTurn[] = []
  for (const message of messages) {
    const current = turns.at(-1)
    if (isTurnBoundaryUserMessage(message) || !current) {
      turns.push({
        id: isTurnBoundaryUserMessage(message) ? message.id : 'lead',
        userMessage: isTurnBoundaryUserMessage(message) ? message : null,
        messages: [message]
      })
      continue
    }
    current.messages.push(message)
  }
  return turns
}

/** A turn is settled when it isn't the live one: every turn but the last, and
 *  the last only once the agent stopped working with no streaming bubble. */
export function isLastTurnSettled(input: {
  isWorking: boolean
  hasStreamingMessage: boolean
}): boolean {
  return !input.isWorking && !input.hasStreamingMessage
}

function turnDurationMs(turn: NativeChatTurn): number | null {
  const postUser = turn.messages.filter((message) => message !== turn.userMessage)
  const first = postUser.find((message) => message.timestamp !== null)?.timestamp ?? null
  const last = postUser.findLast((message) => message.timestamp !== null)?.timestamp ?? null
  if (first === null || last === null) {
    return null
  }
  return Math.max(0, last - first)
}

/**
 * Derive the fold for each settled turn, keyed by turn id. A fold exists when
 * the turn holds more than just its user message + final assistant reply (or
 * ended via interruption — the fold row then carries the stop). User-role rows
 * (queued echoes glued onto a settled turn) never hide.
 */
export function deriveNativeChatTurnFolds(input: {
  messages: readonly NativeChatMessage[]
  isWorking: boolean
}): Map<string, NativeChatTurnFold> {
  const turns = groupNativeChatTurns(input.messages)
  const hasStreamingMessage = input.messages.some(
    (message) => message.id === NATIVE_CHAT_STREAMING_ID
  )
  const lastSettled = isLastTurnSettled({ isWorking: input.isWorking, hasStreamingMessage })

  const folds = new Map<string, NativeChatTurnFold>()
  for (const [index, turn] of turns.entries()) {
    const settled = index < turns.length - 1 || lastSettled
    if (!settled || !turn.userMessage) {
      continue
    }
    const finalAssistant = turn.messages.findLast((message) => message.role === 'assistant') ?? null
    const dropped = new Set<string>()
    const hidden = new Set<string>()
    let interrupted = false
    for (const message of turn.messages) {
      if (message === turn.userMessage || message === finalAssistant) {
        continue
      }
      if (isInterruptStatusMessage(message)) {
        interrupted = true
        dropped.add(message.id)
        continue
      }
      if (message.role === 'user') {
        continue
      }
      hidden.add(message.id)
    }
    if (hidden.size === 0 && !interrupted) {
      continue
    }
    folds.set(turn.id, {
      turnId: turn.id,
      hiddenMessageIds: hidden,
      droppedMessageIds: dropped,
      durationMs: turnDurationMs(turn),
      interrupted
    })
  }
  return folds
}
