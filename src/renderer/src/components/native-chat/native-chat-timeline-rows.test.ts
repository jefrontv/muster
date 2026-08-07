import { describe, it, expect } from 'vitest'
import type {
  NativeChatBlock,
  NativeChatMessage,
  NativeChatRole
} from '../../../../shared/native-chat-types'
import { NATIVE_CHAT_INTERRUPTED_STATUS_TEXT } from '../../../../shared/native-chat-types'
import {
  buildNativeChatTimelineRows,
  deriveNativeChatLiveToolCollapse
} from './native-chat-timeline-rows'

function msg(
  id: string,
  role: NativeChatRole,
  blocks: NativeChatBlock[],
  timestamp: number | null = null
): NativeChatMessage {
  return { id, role, blocks, timestamp, source: 'transcript' }
}

const text = (value: string): NativeChatBlock => ({ type: 'text', text: value })
const tool = (name: string): NativeChatBlock => ({ type: 'tool-call', name, input: {} })

const none: ReadonlySet<string> = new Set()

describe('deriveNativeChatLiveToolCollapse', () => {
  it('is null with one or fewer tool-run rows', () => {
    expect(deriveNativeChatLiveToolCollapse([msg('a1', 'assistant', [tool('Read')])])).toBeNull()
  })
  it('hides all but the most recent tool-run row', () => {
    const collapse = deriveNativeChatLiveToolCollapse([
      msg('a1', 'assistant', [tool('Read')]),
      msg('r1', 'reasoning', [text('thinking')]),
      msg('a2', 'assistant', [tool('Edit')]),
      msg('a3', 'assistant', [text('prose'), tool('Bash')])
    ])
    expect(collapse?.hiddenCount).toBe(2)
    expect([...collapse!.hiddenToolMessageIds].sort()).toEqual(['a1', 'a2'])
    expect(collapse?.latestToolMessageId).toBe('a3')
  })
})

describe('buildNativeChatTimelineRows', () => {
  it('renders a running turn as plain message rows', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [msg('u1', 'user', [text('hi')]), msg('a1', 'assistant', [text('reply')])],
      isWorking: true,
      expandedTurnIds: none,
      expandedLiveToolTurnIds: none
    })
    expect(rows.map((row) => row.kind)).toEqual(['message', 'message'])
  })

  it('folds a settled turn: user row, fold row, final assistant row', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [
        msg('u1', 'user', [text('one')], 1_000),
        msg('r1', 'reasoning', [text('thinking')], 2_000),
        msg('a1', 'assistant', [text('final')], 9_000)
      ],
      isWorking: false,
      expandedTurnIds: none,
      expandedLiveToolTurnIds: none
    })
    expect(
      rows.map((row) => (row.kind === 'message' ? `message:${row.message.id}` : row.kind))
    ).toEqual(['message:u1', 'turn-fold', 'message:a1'])
    const fold = rows[1]
    expect(fold.kind === 'turn-fold' && fold.durationMs).toBe(7_000)
  })

  it('reveals the intermediate rows when the turn is expanded', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [
        msg('u1', 'user', [text('one')], 1_000),
        msg('r1', 'reasoning', [text('thinking')], 2_000),
        msg('a1', 'assistant', [text('final')], 9_000)
      ],
      isWorking: false,
      expandedTurnIds: new Set(['u1']),
      expandedLiveToolTurnIds: none
    })
    expect(
      rows.map((row) => (row.kind === 'message' ? `message:${row.message.id}` : row.kind))
    ).toEqual(['message:u1', 'turn-fold', 'message:r1', 'message:a1'])
  })

  it('always drops the raw interrupt row, expanded or not', () => {
    const messages = [
      msg('u1', 'user', [text('one')], 1_000),
      msg('a1', 'assistant', [text('partial')], 2_000),
      msg('i1', 'system', [text(NATIVE_CHAT_INTERRUPTED_STATUS_TEXT)], 3_000)
    ]
    for (const expandedTurnIds of [none, new Set(['u1'])]) {
      const rows = buildNativeChatTimelineRows({
        messages,
        isWorking: false,
        expandedTurnIds,
        expandedLiveToolTurnIds: none
      })
      expect(rows.some((row) => row.kind === 'message' && row.message.id === 'i1')).toBe(false)
      const fold = rows.find((row) => row.kind === 'turn-fold')
      expect(fold?.kind === 'turn-fold' && fold.interrupted).toBe(true)
    }
  })

  it('collapses earlier tool runs of the running turn behind a toggle row', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [
        msg('u1', 'user', [text('go')]),
        msg('a1', 'assistant', [text('step one'), tool('Read')]),
        msg('r1', 'reasoning', [text('thinking')]),
        msg('a2', 'assistant', [tool('Edit')])
      ],
      isWorking: true,
      expandedTurnIds: none,
      expandedLiveToolTurnIds: none
    })
    expect(
      rows.map((row) =>
        row.kind === 'message'
          ? `${row.message.id}${row.suppressTools ? ':suppressed' : ''}`
          : row.kind
      )
    ).toEqual(['u1', 'a1:suppressed', 'r1', 'live-tool-toggle', 'a2'])
    const toggle = rows.find((row) => row.kind === 'live-tool-toggle')
    expect(toggle?.kind === 'live-tool-toggle' && toggle.hiddenCount).toBe(1)
  })

  it('reveals all tool runs when the live toggle is expanded', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [
        msg('u1', 'user', [text('go')]),
        msg('a1', 'assistant', [tool('Read')]),
        msg('a2', 'assistant', [text('x'), tool('Edit')])
      ],
      isWorking: true,
      expandedTurnIds: none,
      expandedLiveToolTurnIds: new Set(['u1'])
    })
    expect(rows.some((row) => row.kind === 'message' && row.suppressTools)).toBe(false)
    const toggle = rows.find((row) => row.kind === 'live-tool-toggle')
    expect(toggle?.kind === 'live-tool-toggle' && toggle.expanded).toBe(true)
  })

  it('does not apply the live tool collapse to settled turns', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [
        msg('u1', 'user', [text('one')], 1_000),
        msg('a1', 'assistant', [tool('Read')], 2_000),
        msg('a2', 'assistant', [text('final'), tool('Edit')], 3_000),
        msg('u2', 'user', [text('two')], 9_000)
      ],
      isWorking: true,
      expandedTurnIds: none,
      expandedLiveToolTurnIds: none
    })
    expect(rows.some((row) => row.kind === 'live-tool-toggle')).toBe(false)
    // a1 hides behind the settled turn's fold instead.
    expect(rows.some((row) => row.kind === 'turn-fold')).toBe(true)
  })
})
