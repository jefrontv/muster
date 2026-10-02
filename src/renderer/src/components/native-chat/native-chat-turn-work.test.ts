import { describe, expect, it } from 'vitest'
import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'
import { deriveNativeChatTurnWork } from './native-chat-turn-work'

let seq = 0
const msg = (
  role: NativeChatMessage['role'],
  blocks: NativeChatBlock[],
  timestamp = 0
): NativeChatMessage => ({
  id: `m${++seq}`,
  role,
  blocks,
  timestamp,
  source: 'transcript'
})
const call = (id: string, name: string, input: unknown): NativeChatBlock => ({
  type: 'tool-call',
  id,
  name,
  input
})
const result = (toolUseId: string, output = 'ok'): NativeChatBlock => ({
  type: 'tool-result',
  toolUseId,
  output
})

const turn = [
  msg('reasoning', [{ type: 'text', text: 'Thinking it over' }]),
  msg(
    'assistant',
    [
      call('r1', 'Read', { file_path: '/s/a.php' }),
      call('r2', 'Read', { file_path: '/s/b.php' }),
      call('t1', 'TodoWrite', { todos: [] })
    ],
    1_000
  ),
  // Results arrive out of order; tool_use_id pairs them.
  msg('user', [result('r2'), result('r1'), result('t1')], 2_000),
  msg('assistant', [call('b1', 'Bash', { command: 'ls', description: 'List files' })], 3_000)
]

describe('deriveNativeChatTurnWork', () => {
  it('groups consecutive reads, hides TodoWrite and keeps thinking for Code only', () => {
    const code = deriveNativeChatTurnWork(turn, { surface: 'code', live: false })
    expect(code.entries.map((entry) => entry.kind)).toEqual(['thinking', 'explore', 'tool'])
    expect(code.entries[1]).toMatchObject({ kind: 'explore', label: 'Explored 2 files' })
    expect(code.activities).toHaveLength(3)
    const chat = deriveNativeChatTurnWork(turn, { surface: 'chat', live: false })
    expect(chat.entries.map((entry) => entry.kind)).toEqual(['explore', 'tool'])
  })

  it('pairs results to calls by tool_use_id', () => {
    const work = deriveNativeChatTurnWork(turn, { surface: 'code', live: false })
    const explore = work.entries[1]
    expect(explore?.kind === 'explore' && explore.entries.map((e) => e.result?.toolUseId)).toEqual([
      'r1',
      'r2'
    ])
  })

  it('reports the running call as the live label, the same rows either way', () => {
    const live = deriveNativeChatTurnWork(turn, { surface: 'chat', live: true })
    const settled = deriveNativeChatTurnWork(turn, { surface: 'chat', live: false })
    expect(live.liveLabel).toBe('List files')
    expect(settled.liveLabel).toBeNull()
    expect(live.entries.map((entry) => entry.key)).toEqual(
      settled.entries.map((entry) => entry.key)
    )
  })

  it('lifts ActiveCollab writes out as event chips', () => {
    const work = deriveNativeChatTurnWork(
      [msg('assistant', [call('a1', 'mcp__activecollab__create_task', { name: 'Fix header' })])],
      { surface: 'chat', live: false }
    )
    expect(work.events).toHaveLength(1)
    expect(work.entries).toEqual([])
  })
})
