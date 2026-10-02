import { describe, it, expect } from 'vitest'
import type {
  NativeChatBlock,
  NativeChatMessage,
  NativeChatRole
} from '../../../../shared/native-chat-types'
import { NATIVE_CHAT_INTERRUPTED_STATUS_TEXT } from '../../../../shared/native-chat-types'
import type { NativeChatSurface } from '../../../../shared/native-chat-tool-activity-types'
import {
  buildNativeChatTimelineRows,
  nativeChatWorkLogPresentation,
  type NativeChatTimelineRow
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
const call = (name: string, id: string, input: unknown = {}): NativeChatBlock => ({
  type: 'tool-call',
  name,
  input,
  id
})
const result = (id: string, output = 'ok'): NativeChatBlock => ({
  type: 'tool-result',
  output,
  toolUseId: id
})

const shape = (rows: NativeChatTimelineRow[]): string[] =>
  rows.map((row) => (row.kind === 'message' ? `message:${row.message.id}` : row.kind))

// A turn that narrates, works, narrates again, then answers.
const turn = [
  msg('u1', 'user', [text('fix the header')], 1_000),
  msg('a1', 'assistant', [text('Let me check the template'), call('Read', 't1')], 2_000),
  msg('tr1', 'tool', [result('t1')], 3_000),
  msg('a2', 'assistant', [text('Found it, editing'), call('Bash', 't2', { command: 'ls' })], 4_000),
  msg('tr2', 'tool', [result('t2')], 5_000),
  msg('a3', 'assistant', [text('Done.')], 9_000)
]

function build(isWorking: boolean, surface: NativeChatSurface = 'chat') {
  return buildNativeChatTimelineRows({ messages: turn, isWorking, surface })
}

describe('one visibility rule for live and settled turns', () => {
  it('keeps every prose row and one work log in the same place, live or settled', () => {
    const expected = ['message:u1', 'message:a1', 'work-log', 'message:a2', 'message:a3']
    expect(shape(build(true))).toEqual(expected)
    // The turn landing must not add or remove rows (no growth, no jump).
    expect(shape(build(false))).toEqual(expected)
  })

  it('gathers every call of the turn into that one log', () => {
    const log = build(false).find((row) => row.kind === 'work-log')
    expect(log?.kind === 'work-log' && log.work.activities.map((a) => a.group)).toEqual([
      'read',
      'command'
    ])
  })

  it('presents the log by surface: Chat live is the status line, Code live is open', () => {
    expect(nativeChatWorkLogPresentation({ surface: 'chat', live: true, toggled: false })).toBe(
      'hidden'
    )
    expect(nativeChatWorkLogPresentation({ surface: 'code', live: true, toggled: false })).toBe(
      'open'
    )
    for (const surface of ['chat', 'code'] as const) {
      expect(nativeChatWorkLogPresentation({ surface, live: false, toggled: false })).toBe(
        'collapsed'
      )
      expect(nativeChatWorkLogPresentation({ surface, live: false, toggled: true })).toBe('open')
    }
  })

  it('tracks live and settled flips apart', () => {
    const rows = buildNativeChatTimelineRows({
      messages: turn,
      isWorking: false,
      surface: 'code',
      toggles: { workLogs: new Set(['u1:live']) }
    })
    expect(rows.find((row) => row.kind === 'work-log')).toMatchObject({
      presentation: 'collapsed'
    })
  })

  it('never renders thinking or the raw interrupt line as prose', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [
        msg('u1', 'user', [text('go')], 1_000),
        msg('r1', 'reasoning', [text('pondering')], 2_000),
        msg('a1', 'assistant', [text('partial')], 3_000),
        msg('i1', 'system', [text(NATIVE_CHAT_INTERRUPTED_STATUS_TEXT)], 4_000)
      ],
      isWorking: false,
      surface: 'code'
    })
    expect(shape(rows)).toEqual(['message:u1', 'work-log', 'message:a1'])
    expect(rows[1]).toMatchObject({ kind: 'work-log', interrupted: true })
  })

  it('puts Copy and Retry on the final reply of settled turns only', () => {
    const settled = build(false).filter((row) => row.kind === 'message' && row.showReplyActions)
    expect(settled.map((row) => row.kind === 'message' && row.message.id)).toEqual(['a3'])
    expect(settled[0]).toMatchObject({ isLatestReply: true })
    expect(build(true).some((row) => row.kind === 'message' && row.showReplyActions)).toBe(false)
  })
})

describe('turn plan, changes card and error', () => {
  const todo: NativeChatBlock = {
    type: 'tool-call',
    name: 'TodoWrite',
    input: { todos: [{ content: 'Add the parser', status: 'in_progress' }] }
  }

  it('anchors the plan under the prompt and keeps TodoWrite out of the work log', () => {
    const rows = buildNativeChatTimelineRows({
      messages: [msg('u1', 'user', [text('go')]), msg('a1', 'assistant', [todo])],
      isWorking: true,
      surface: 'code'
    })
    expect(shape(rows)).toEqual(['message:u1', 'turn-plan'])
  })

  it('adds the changes card after a settled turn that edited files', () => {
    const edit = call('Edit', 'e1', { file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' })
    const rows = buildNativeChatTimelineRows({
      messages: [
        msg('u1', 'user', [text('fix')], 1_000),
        msg('a1', 'assistant', [edit], 2_000),
        msg('tr', 'tool', [result('e1')], 3_000),
        msg('a2', 'assistant', [text('done')], 4_000)
      ],
      isWorking: false,
      surface: 'code'
    })
    expect(shape(rows)).toEqual(['message:u1', 'work-log', 'message:a2', 'turn-changed-files'])
  })

  it('shows the last turn error inline at its end', () => {
    const rows = buildNativeChatTimelineRows({
      messages: turn,
      isWorking: false,
      surface: 'chat',
      lastError: 'error_max_turns'
    })
    expect(rows.at(-1)).toMatchObject({ kind: 'turn-error', message: 'error_max_turns' })
  })
})
