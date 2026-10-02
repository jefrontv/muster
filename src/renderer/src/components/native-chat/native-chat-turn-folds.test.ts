import { describe, it, expect } from 'vitest'
import {
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatMessage,
  type NativeChatRole,
  type NativeChatSource
} from '../../../../shared/native-chat-types'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'
import {
  deriveNativeChatTurnStates,
  groupNativeChatTurns,
  isTurnBoundaryUserMessage,
  nativeChatMessageText
} from './native-chat-turn-folds'

function msg(
  id: string,
  role: NativeChatRole,
  text: string,
  options: { timestamp?: number | null; source?: NativeChatSource } = {}
): NativeChatMessage {
  return {
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: options.timestamp ?? null,
    source: options.source ?? 'transcript'
  }
}

describe('isTurnBoundaryUserMessage', () => {
  it('accepts real user messages only', () => {
    expect(isTurnBoundaryUserMessage(msg('u1', 'user', 'hi'))).toBe(true)
    expect(isTurnBoundaryUserMessage(msg('a1', 'assistant', 'hey'))).toBe(false)
  })
  it('excludes pending scrape echoes and the streaming bubble', () => {
    expect(isTurnBoundaryUserMessage(msg('pending:1', 'user', 'hi', { source: 'scrape' }))).toBe(
      false
    )
    expect(isTurnBoundaryUserMessage(msg(NATIVE_CHAT_STREAMING_ID, 'user', 'hi'))).toBe(false)
  })
})

describe('groupNativeChatTurns', () => {
  it('splits at user boundaries and keys turns by the user message id', () => {
    const turns = groupNativeChatTurns([
      msg('u1', 'user', 'one'),
      msg('a1', 'assistant', 'first'),
      msg('u2', 'user', 'two'),
      msg('a2', 'assistant', 'second')
    ])
    expect(turns.map((turn) => turn.id)).toEqual(['u1', 'u2'])
    expect(turns[1]?.messages.map((m) => m.id)).toEqual(['u2', 'a2'])
  })
  it('collects boundary-less leading rows into a lead turn', () => {
    const turns = groupNativeChatTurns([
      msg('s1', 'system', 'booted'),
      msg('u1', 'user', 'one'),
      msg('a1', 'assistant', 'reply')
    ])
    expect(turns.map((turn) => turn.id)).toEqual(['lead', 'u1'])
    expect(turns[0]?.userMessage).toBeNull()
  })
  it('keeps a pending echo inside the previous turn (not a boundary)', () => {
    const turns = groupNativeChatTurns([
      msg('u1', 'user', 'one'),
      msg('a1', 'assistant', 'reply'),
      msg('pending:1', 'user', 'queued', { source: 'scrape' })
    ])
    expect(turns).toHaveLength(1)
  })
})

describe('deriveNativeChatTurnStates', () => {
  const turn = [
    msg('u1', 'user', 'one', { timestamp: 1_000 }),
    msg('r1', 'reasoning', 'thinking', { timestamp: 2_000 }),
    msg('a2', 'assistant', 'final', { timestamp: 10_000 })
  ]
  const states = (messages: NativeChatMessage[], isWorking: boolean) =>
    deriveNativeChatTurnStates({ turns: groupNativeChatTurns(messages), isWorking })

  it('settles every turn but the live last one, measuring post-prompt duration', () => {
    const result = states([...turn, msg('u2', 'user', 'two', { timestamp: 20_000 })], true)
    expect(result.get('u1')).toEqual({ settled: true, durationMs: 8_000, interrupted: false })
    expect(result.get('u2')?.settled).toBe(false)
  })

  it('keeps the last turn live while working or streaming', () => {
    expect(states(turn, true).get('u1')?.settled).toBe(false)
    const streaming = [...turn, msg(NATIVE_CHAT_STREAMING_ID, 'assistant', 'live')]
    expect(states(streaming, false).get('u1')?.settled).toBe(false)
    expect(states(turn, false).get('u1')?.settled).toBe(true)
  })

  it('marks interrupted turns, timing them to the interrupt', () => {
    const result = states(
      [
        msg('u1', 'user', 'one', { timestamp: 1_000 }),
        msg('a1', 'assistant', 'partial', { timestamp: 2_000 }),
        msg('i1', 'system', NATIVE_CHAT_INTERRUPTED_STATUS_TEXT, { timestamp: 13_000 })
      ],
      false
    )
    expect(result.get('u1')).toEqual({ settled: true, durationMs: 11_000, interrupted: true })
  })

  it('reports a null duration when timestamps are missing', () => {
    const result = states([msg('u1', 'user', 'one'), msg('a1', 'assistant', 'final')], false)
    expect(result.get('u1')?.durationMs).toBeNull()
  })
})

describe('nativeChatMessageText', () => {
  it('joins and trims text blocks', () => {
    expect(nativeChatMessageText(msg('u1', 'user', '  hi  '))).toBe('hi')
  })
})
