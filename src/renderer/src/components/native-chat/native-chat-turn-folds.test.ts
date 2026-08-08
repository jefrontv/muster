import { describe, it, expect } from 'vitest'
import {
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatMessage,
  type NativeChatRole,
  type NativeChatSource
} from '../../../../shared/native-chat-types'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'
import {
  deriveNativeChatTurnFolds,
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

describe('deriveNativeChatTurnFolds', () => {
  const foldable = [
    msg('u1', 'user', 'one', { timestamp: 1_000 }),
    msg('r1', 'reasoning', 'thinking', { timestamp: 2_000 }),
    msg('a1', 'assistant', 'progress', { timestamp: 3_000 }),
    msg('a2', 'assistant', 'final', { timestamp: 10_000 })
  ]

  it('folds a settled turn behind its intermediate rows', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [...foldable, msg('u2', 'user', 'two', { timestamp: 20_000 })],
      isWorking: true
    })
    const fold = folds.get('u1')
    expect(fold).toBeDefined()
    expect([...fold!.hiddenMessageIds].sort()).toEqual(['a1', 'r1'])
    expect(fold!.durationMs).toBe(8_000)
    expect(fold!.interrupted).toBe(false)
  })

  it('never folds the running turn', () => {
    expect(deriveNativeChatTurnFolds({ messages: foldable, isWorking: true }).size).toBe(0)
  })

  it('never folds a turn holding the streaming bubble', () => {
    const messages = [...foldable, msg(NATIVE_CHAT_STREAMING_ID, 'assistant', 'live')]
    expect(deriveNativeChatTurnFolds({ messages, isWorking: false }).size).toBe(0)
  })

  it('folds the last turn once settled (not working, no streaming)', () => {
    const folds = deriveNativeChatTurnFolds({ messages: foldable, isWorking: false })
    expect(folds.get('u1')).toBeDefined()
  })

  it('skips turns holding only user + final assistant', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('u1', 'user', 'one', { timestamp: 1_000 }),
        msg('a1', 'assistant', 'final', { timestamp: 2_000 })
      ],
      isWorking: false
    })
    expect(folds.size).toBe(0)
  })

  it('never folds the boundary-less lead group', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('s1', 'system', 'a'),
        msg('s2', 'system', 'b'),
        msg('a1', 'assistant', 'reply'),
        msg('u1', 'user', 'next', { timestamp: 5_000 })
      ],
      isWorking: true
    })
    expect(folds.has('lead')).toBe(false)
  })

  it('marks interrupted turns and drops the raw interrupt row', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('u1', 'user', 'one', { timestamp: 1_000 }),
        msg('a1', 'assistant', 'partial', { timestamp: 2_000 }),
        msg('i1', 'system', NATIVE_CHAT_INTERRUPTED_STATUS_TEXT, { timestamp: 13_000 })
      ],
      isWorking: false
    })
    const fold = folds.get('u1')
    expect(fold?.interrupted).toBe(true)
    expect(fold?.droppedMessageIds.has('i1')).toBe(true)
    expect(fold?.hiddenMessageIds.has('i1')).toBe(false)
    // Duration runs to the interrupt itself: 13s − 2s.
    expect(fold?.durationMs).toBe(11_000)
  })

  it('never hides user-role rows (queued echoes glued onto a settled turn)', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('u1', 'user', 'one', { timestamp: 1_000 }),
        msg('r1', 'reasoning', 'thinking', { timestamp: 2_000 }),
        msg('a1', 'assistant', 'final', { timestamp: 3_000 }),
        msg('pending:1', 'user', 'queued', { source: 'scrape', timestamp: 4_000 })
      ],
      isWorking: false
    })
    const fold = folds.get('u1')
    expect(fold?.hiddenMessageIds.has('pending:1')).toBe(false)
  })

  it('reports a null duration when timestamps are missing', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('u1', 'user', 'one'),
        msg('r1', 'reasoning', 'thinking'),
        msg('a1', 'assistant', 'final'),
        msg('u2', 'user', 'two')
      ],
      isWorking: true
    })
    expect(folds.get('u1')?.durationMs).toBeNull()
  })
})

describe('nativeChatMessageText', () => {
  it('joins and trims text blocks', () => {
    expect(nativeChatMessageText(msg('u1', 'user', '  hi  '))).toBe('hi')
  })
})

describe('slash-command turns keep their feedback visible', () => {
  it('leaves the trailing system line outside the fold when no assistant reply exists', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('u1', 'user', '/foobar', { timestamp: 1 }),
        msg('r1', 'reasoning', 'thinking', { timestamp: 2 }),
        msg('s1', 'system', 'Unknown command: /foobar', { timestamp: 3 })
      ],
      isWorking: false
    })
    const fold = folds.get('u1')
    expect(fold?.hiddenMessageIds.has('s1')).toBe(false)
    expect(fold?.hiddenMessageIds.has('r1')).toBe(true)
  })

  it('still folds system rows when an assistant reply closes the turn', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('u1', 'user', 'hi', { timestamp: 1 }),
        msg('s1', 'system', 'Conversation compacted', { timestamp: 2 }),
        msg('a1', 'assistant', 'done', { timestamp: 3 })
      ],
      isWorking: false
    })
    expect(folds.get('u1')?.hiddenMessageIds.has('s1')).toBe(true)
  })

  it('never surfaces the interrupt status row as the visible tail', () => {
    const folds = deriveNativeChatTurnFolds({
      messages: [
        msg('u1', 'user', '/x', { timestamp: 1 }),
        msg('r1', 'reasoning', 'thinking', { timestamp: 2 }),
        msg('i1', 'system', NATIVE_CHAT_INTERRUPTED_STATUS_TEXT, { timestamp: 3 })
      ],
      isWorking: false
    })
    const fold = folds.get('u1')
    expect(fold?.droppedMessageIds.has('i1')).toBe(true)
    expect(fold?.interrupted).toBe(true)
  })
})
