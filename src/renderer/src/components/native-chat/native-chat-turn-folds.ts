// Turn grouping for the native chat timeline. A turn opens at a real user
// message; its work log header reads the turn's state (settled, duration,
// interrupted). Pure so the rules are unit-testable.

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

/** How a turn ended, for its work log header. */
export type NativeChatTurnState = {
  settled: boolean
  /** Last-message timestamp minus first-post-user timestamp; null when unmeasurable. */
  durationMs: number | null
  interrupted: boolean
}

/** Settledness for every turn: all but the last, and the last once the agent stopped. */
export function deriveNativeChatTurnStates(input: {
  turns: readonly NativeChatTurn[]
  isWorking: boolean
}): Map<string, NativeChatTurnState> {
  const lastSettled = isLastTurnSettled({
    isWorking: input.isWorking,
    hasStreamingMessage:
      input.turns.at(-1)?.messages.some((message) => message.id === NATIVE_CHAT_STREAMING_ID) ===
      true
  })
  const states = new Map<string, NativeChatTurnState>()
  input.turns.forEach((turn, index) => {
    states.set(turn.id, {
      settled: index < input.turns.length - 1 || lastSettled,
      durationMs: turnDurationMs(turn),
      interrupted: turn.messages.some(isInterruptStatusMessage)
    })
  })
  return states
}
