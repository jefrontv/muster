import { describe, expect, it } from 'vitest'
import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import {
  NATIVE_CHAT_INTERRUPTED_STATUS_TEXT,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'
import { nativeChatStreamingMessage } from '../../../../shared/native-chat-streaming'
import { decodeClaudeTranscriptLine } from '../../../../main/native-chat/transcript-line-decoders-claude'
import { decodeCodexTranscriptLine } from '../../../../main/native-chat/transcript-line-decoders-codex'
import { decodeGrokTranscriptLine } from '../../../../main/native-chat/transcript-line-decoders-grok'
import {
  nativeChatEngineMeta,
  nativeChatEngineTurns,
  type NativeChatEngineTurnsInput,
  type NativeChatEngineTurnsState
} from './native-chat-engine-turns'
import { parseCodexPatch } from './native-chat-engine-tool-names'

const T0 = Date.parse('2026-10-20T10:00:00.000Z')
const at = (seconds: number): string => new Date(T0 + seconds * 1000).toISOString()

function decode(
  decoder: (line: string, fallbackId: string) => NativeChatMessage | null,
  records: unknown[]
): NativeChatMessage[] {
  return records.flatMap((record, index) => {
    const message = decoder(JSON.stringify(record), `line-${index}`)
    return message ? [message] : []
  })
}

function build(
  overrides: Partial<NativeChatEngineTurnsInput> & Pick<NativeChatEngineTurnsInput, 'messages'>,
  previous: NativeChatEngineTurnsState | null = null
): NativeChatEngineTurnsState {
  return nativeChatEngineTurns(
    {
      agent: 'claude',
      isWorking: false,
      awaitingUser: false,
      failedDeliveryText: 'Not delivered — check the terminal',
      now: T0,
      ...overrides
    },
    previous
  )
}

const tools = (turn: ChatEngineTurn | undefined) =>
  (turn?.items ?? []).filter(
    (item): item is Extract<ChatEngineItem, { kind: 'tool' }> => item.kind === 'tool'
  )

// Claude Code transcript records, trimmed to the fields the decoder reads.
const CLAUDE_RECORDS = [
  {
    type: 'user',
    uuid: 'u1',
    timestamp: at(0),
    message: { role: 'user', content: 'Change 100vh to 100dvh in style.css' }
  },
  {
    type: 'assistant',
    uuid: 'a1',
    timestamp: at(1),
    message: {
      id: 'msg_1',
      role: 'assistant',
      content: [{ type: 'thinking', thinking: 'Read the file first.' }]
    }
  },
  {
    type: 'assistant',
    uuid: 'a2',
    timestamp: at(2),
    message: {
      id: 'msg_1',
      role: 'assistant',
      content: [
        { type: 'text', text: 'Reading it now.' },
        {
          type: 'tool_use',
          id: 'toolu_read',
          name: 'Read',
          input: { file_path: '/repo/style.css' }
        }
      ]
    }
  },
  {
    type: 'user',
    uuid: 'r1',
    timestamp: at(3),
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_read', content: '1\theight: 100vh;' }]
    }
  },
  {
    type: 'assistant',
    uuid: 'a3',
    timestamp: at(4),
    message: {
      id: 'msg_2',
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_edit',
          name: 'Edit',
          input: { file_path: '/repo/style.css', old_string: '100vh', new_string: '100dvh' }
        }
      ]
    }
  },
  {
    type: 'user',
    uuid: 'r2',
    timestamp: at(6),
    toolUseResult: {
      structuredPatch: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: ['-height: 100vh;', '+height: 100dvh;']
        }
      ]
    },
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_edit', content: 'Updated style.css' }]
    }
  },
  {
    type: 'assistant',
    uuid: 'a4',
    timestamp: at(7),
    message: { id: 'msg_3', role: 'assistant', content: [{ type: 'text', text: 'Done.' }] }
  }
]

describe('nativeChatEngineTurns: Claude', () => {
  const messages = decode(decodeClaudeTranscriptLine, CLAUDE_RECORDS)

  it('turns a settled transcript into one turn with prose, thinking and paired tools', () => {
    const { turns } = build({ messages })
    expect(turns).toHaveLength(1)
    const [turn] = turns
    expect(turn).toMatchObject({
      id: 'u1',
      status: 'done',
      user: { text: 'Change 100vh to 100dvh in style.css', delivery: 'delivered' },
      durationMs: 6000
    })
    expect(turn!.items.map((item) => item.kind)).toEqual([
      'thinking',
      'text',
      'tool',
      'tool',
      'text'
    ])
    const [read, edit] = tools(turn)
    expect(read).toMatchObject({ id: 'toolu_read', name: 'Read', status: 'done' })
    expect(edit).toMatchObject({
      id: 'toolu_edit',
      name: 'Edit',
      status: 'done',
      elapsedSeconds: 2,
      result: { additions: 1, deletions: 1, patch: [{ oldStart: 1 }] }
    })
  })

  it('keeps the live turn running with the unanswered call out', () => {
    const { turns } = build({ messages: messages.slice(0, 4), isWorking: true })
    expect(turns[0]).toMatchObject({ status: 'running', endedAt: null, durationMs: null })
    expect(tools(turns[0])[0]).toMatchObject({ status: 'done' })
    const live = build({ messages: messages.slice(0, 5), isWorking: true })
    expect(tools(live.turns[0])[1]).toMatchObject({ name: 'Edit', status: 'running' })
  })

  it('holds the turn open while a question waits on the user', () => {
    const { turns } = build({ messages: messages.slice(0, 5), awaitingUser: true })
    expect(turns[0]?.status).toBe('running')
  })

  it('swaps the streaming preview for the transcript reply without changing its id', () => {
    const head = messages.slice(0, 6)
    const streaming = build({
      messages: [...head, nativeChatStreamingMessage('Do')],
      isWorking: true
    })
    const preview = streaming.turns[0]!.items.at(-1)
    expect(preview).toMatchObject({ kind: 'text', streaming: true, text: 'Do' })
    const landed = build({ messages }, streaming)
    const reply = landed.turns[0]!.items.at(-1)
    expect(reply).toMatchObject({ kind: 'text', streaming: false, text: 'Done.' })
    expect(reply?.id).toBe(preview?.id)
  })

  it('reuses unchanged turns and items so one update re-renders one row', () => {
    const second: NativeChatMessage[] = [
      {
        id: 'u2',
        role: 'user',
        blocks: [{ type: 'text', text: 'Thanks' }],
        timestamp: T0 + 10_000,
        source: 'transcript'
      }
    ]
    const first = build({
      messages: [...messages, ...second, nativeChatStreamingMessage('You')],
      isWorking: true
    })
    const next = build(
      {
        messages: [...messages, ...second, nativeChatStreamingMessage('You are')],
        isWorking: true
      },
      first
    )
    expect(next.turns[0]).toBe(first.turns[0])
    expect(next.turns[1]).not.toBe(first.turns[1])
    expect(next.turns[1]!.user).toBe(first.turns[1]!.user)
    const same = build(
      {
        messages: [...messages, ...second, nativeChatStreamingMessage('You are')],
        isWorking: true
      },
      next
    )
    expect(same.turns[1]).toBe(next.turns[1])
  })

  it('keeps an optimistic send on its turn id once the transcript delivers it', () => {
    const echo: NativeChatMessage = {
      id: 'pending:1',
      role: 'user',
      blocks: [{ type: 'text', text: 'Ship it' }],
      timestamp: T0 + 20_000,
      source: 'scrape'
    }
    const sent = build({ messages: [...messages, echo], isWorking: true })
    expect(sent.turns[1]).toMatchObject({
      id: 'pending:1',
      status: 'running',
      user: { delivery: 'local', text: 'Ship it' }
    })
    const delivered: NativeChatMessage = { ...echo, id: 'u9', source: 'transcript' }
    const landed = build({ messages: [...messages, delivered], isWorking: true }, sent)
    expect(landed.turns[1]).toMatchObject({ id: 'pending:1', user: { delivery: 'delivered' } })
    const later = build({ messages: [...messages, delivered] }, landed)
    expect(later.turns[1]?.id).toBe('pending:1')
  })

  it('marks a stopped turn and its unanswered call as interrupted', () => {
    const stop: NativeChatMessage = {
      id: 's1',
      role: 'system',
      blocks: [{ type: 'text', text: NATIVE_CHAT_INTERRUPTED_STATUS_TEXT }],
      timestamp: T0 + 5000,
      source: 'transcript'
    }
    const { turns } = build({ messages: [...messages.slice(0, 5), stop] })
    expect(turns[0]?.status).toBe('interrupted')
    expect(tools(turns[0])[1]?.status).toBe('interrupted')
    expect(turns[0]!.items.some((item) => item.kind === 'notice')).toBe(false)
  })

  it('fails a launch prompt the agent never received', () => {
    const prompt: NativeChatMessage = {
      id: 'launch-pending:tab',
      role: 'user',
      blocks: [{ type: 'text', text: 'Hello' }],
      timestamp: T0,
      source: 'scrape'
    }
    const { turns } = build({
      messages: [prompt],
      failedDeliveryMessageIds: new Set(['launch-pending:tab'])
    })
    expect(turns[0]).toMatchObject({
      status: 'error',
      errorMessage: 'Not delivered — check the terminal'
    })
  })

  it('carries pasted images as path notes the bubble lifts into thumbnails', () => {
    const { turns } = build({
      messages: [
        {
          id: 'u1',
          role: 'user',
          blocks: [
            { type: 'image-ref', path: '/tmp/orca-paste-1.png' },
            { type: 'image-ref', url: 'https://example.com/a.png' },
            { type: 'text', text: 'What is this?' }
          ],
          timestamp: T0,
          source: 'transcript'
        }
      ]
    })
    expect(turns[0]?.user).toMatchObject({
      text: 'What is this?\n[attached image: /tmp/orca-paste-1.png]',
      imageCount: 2
    })
  })

  it('draws a helper agent call as an agent row with its first line as summary', () => {
    const { turns } = build({
      messages: [
        {
          id: 'u1',
          role: 'user',
          blocks: [{ type: 'text', text: 'Go' }],
          timestamp: T0,
          source: 'transcript'
        },
        {
          id: 'a1',
          role: 'assistant',
          blocks: [
            {
              type: 'tool-call',
              id: 'toolu_task',
              name: 'Task',
              input: { description: 'Check headers', subagent_type: 'Explore' }
            }
          ],
          timestamp: T0 + 1000,
          source: 'transcript'
        },
        {
          id: 'r1',
          role: 'tool',
          blocks: [
            { type: 'tool-result', toolUseId: 'toolu_task', output: '\nAll headers fine.\nMore' }
          ],
          timestamp: T0 + 2000,
          source: 'transcript'
        }
      ]
    })
    expect(turns[0]!.items[0]).toEqual({
      kind: 'agent',
      id: 'toolu_task',
      description: 'Check headers',
      subagentType: 'Explore',
      status: 'done',
      summary: 'All headers fine.',
      items: []
    })
  })

  it('puts rows before the first loaded prompt in a lead turn', () => {
    const { turns } = build({ messages: messages.slice(4) })
    expect(turns[0]).toMatchObject({ id: 'lead', user: null })
  })
})

describe('nativeChatEngineTurns: Codex', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: notes.md',
    '+# Notes',
    '+first',
    '*** Update File: src/app.ts',
    '@@ function main',
    ' const a = 1',
    '-const b = 2',
    '+const b = 3',
    '*** End Patch'
  ].join('\n')
  const records = [
    {
      type: 'event_msg',
      timestamp: at(0),
      payload: { type: 'user_message', id: 'u1', message: 'Build and fix it' }
    },
    {
      type: 'response_item',
      timestamp: at(1),
      payload: {
        type: 'reasoning',
        id: 'rs1',
        summary: [{ type: 'summary_text', text: 'Run make' }]
      }
    },
    {
      type: 'response_item',
      timestamp: at(2),
      payload: {
        type: 'function_call',
        id: 'fc1',
        name: 'shell',
        arguments: '{"command":["bash","-lc","make"]}'
      }
    },
    {
      type: 'response_item',
      timestamp: at(3),
      payload: {
        type: 'function_call_output',
        id: 'fo1',
        output: '{"output":"make: *** error","metadata":{"exit_code":2}}'
      }
    },
    {
      type: 'response_item',
      timestamp: at(4),
      payload: {
        type: 'function_call',
        id: 'fc2',
        name: 'apply_patch',
        arguments: JSON.stringify({ input: patch })
      }
    },
    {
      type: 'response_item',
      timestamp: at(5),
      payload: { type: 'function_call_output', id: 'fo2', output: 'Success.' }
    },
    {
      type: 'response_item',
      timestamp: at(6),
      payload: {
        type: 'function_call',
        id: 'fc3',
        name: 'update_plan',
        arguments:
          '{"plan":[{"step":"Fix build","status":"completed"},{"step":"Test","status":"in_progress"}]}'
      }
    },
    {
      type: 'response_item',
      timestamp: at(6),
      payload: { type: 'function_call_output', id: 'fo3', output: 'Plan updated' }
    },
    {
      type: 'response_item',
      timestamp: at(7),
      payload: {
        type: 'function_call',
        id: 'fc4',
        name: 'exec_command',
        arguments: '{"cmd":"npm test"}'
      }
    },
    {
      type: 'response_item',
      timestamp: at(8),
      payload: {
        type: 'function_call_output',
        id: 'fo4',
        output:
          'Chunk ID: 1\nWall time: 0.2 seconds\nProcess exited with code 0\nOutput:\nall green'
      }
    },
    {
      type: 'response_item',
      timestamp: at(9),
      payload: {
        type: 'function_call',
        id: 'fc5',
        name: 'write_stdin',
        arguments: '{"session_id":1}'
      }
    }
  ]
  const messages = decode(decodeCodexTranscriptLine, records)

  it('maps shell, apply_patch, update_plan and exec_command onto the registry', () => {
    const { turns } = build({ agent: 'codex', messages })
    const [turn] = turns
    expect(turn!.items[0]).toMatchObject({ kind: 'thinking', text: 'Run make' })
    const [make, write, edit, plan, test, stdin] = tools(turn)
    expect(make).toMatchObject({
      name: 'Bash',
      input: { command: 'make' },
      status: 'error',
      result: { text: 'Exit code 2\nmake: *** error', stdout: 'make: *** error', isError: true }
    })
    expect(write).toMatchObject({
      id: 'fc2:tool:0:0',
      name: 'Write',
      input: { file_path: 'notes.md', content: '# Notes\nfirst' },
      status: 'done'
    })
    expect(edit).toMatchObject({
      id: 'fc2:tool:0:1',
      name: 'Edit',
      input: {
        file_path: 'src/app.ts',
        old_string: 'const a = 1\nconst b = 2',
        new_string: 'const a = 1\nconst b = 3'
      }
    })
    expect(plan).toMatchObject({
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Fix build', status: 'completed' },
          { content: 'Test', status: 'in_progress' }
        ]
      }
    })
    expect(test).toMatchObject({
      name: 'Bash',
      input: { command: 'npm test' },
      status: 'done',
      result: { stdout: 'all green', isError: false }
    })
    // No registry shape fits; the generic card draws it under its own name.
    expect(stdin).toMatchObject({ name: 'write_stdin', input: { session_id: 1 } })
  })

  it('reads a multi-chunk update as one MultiEdit', () => {
    const files = parseCodexPatch(
      ['*** Update File: a.ts', '@@', '-x', '+y', '@@', '-p', '+q'].join('\n')
    )
    expect(files).toEqual([
      {
        op: 'update',
        path: 'a.ts',
        chunks: [
          { old: ['x'], next: ['y'] },
          { old: ['p'], next: ['q'] }
        ]
      }
    ])
    const { turns } = build({
      agent: 'codex',
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          blocks: [
            {
              type: 'tool-call',
              name: 'apply_patch',
              input: '*** Update File: a.ts\n@@\n-x\n+y\n@@\n-p\n+q'
            }
          ],
          timestamp: T0,
          source: 'transcript'
        }
      ]
    })
    expect(tools(turns[0])[0]).toMatchObject({
      name: 'MultiEdit',
      input: {
        file_path: 'a.ts',
        edits: [
          { old_string: 'x', new_string: 'y' },
          { old_string: 'p', new_string: 'q' }
        ]
      }
    })
  })
})

describe('nativeChatEngineTurns: Grok', () => {
  const records = [
    {
      type: 'user',
      id: 'u1',
      timestamp: at(0),
      content: [{ type: 'text', text: '<user_query>List files</user_query>' }]
    },
    {
      type: 'assistant',
      id: 'a1',
      timestamp: at(1),
      content: [{ type: 'text', text: 'Looking.' }],
      tool_calls: [
        { id: 'c1', name: 'run_terminal_command', arguments: '{"command":"ls"}' },
        { id: 'c2', name: 'read_file', arguments: '{"path":"/repo/a.ts","offset":3,"limit":10}' },
        {
          id: 'c3',
          name: 'search_replace',
          arguments: '{"file_path":"/repo/a.ts","old_string":"a","new_string":"b"}'
        },
        { id: 'c4', name: 'grep', arguments: '{"pattern":"foo"}' },
        { id: 'c5', name: 'mystery_tool', arguments: '{"x":1}' }
      ]
    },
    { type: 'tool_result', id: 'r1', timestamp: at(2), content: 'a.ts\nb.ts' }
  ]
  const messages = decode(decodeGrokTranscriptLine, records)

  it('maps terminal, read, edit and search tools; leaves unknown ones generic', () => {
    const { turns } = build({ agent: 'grok', messages, isWorking: true })
    const [turn] = turns
    expect(turn!.user?.text).toBe('List files')
    expect(tools(turn).map((tool) => [tool.name, tool.status])).toEqual([
      ['Bash', 'done'],
      ['Read', 'running'],
      ['Edit', 'running'],
      ['Grep', 'running'],
      ['mystery_tool', 'running']
    ])
    expect(tools(turn)[0]).toMatchObject({
      input: { command: 'ls' },
      result: { text: 'a.ts\nb.ts' }
    })
    expect(tools(turn)[1]?.input).toEqual({ file_path: '/repo/a.ts', offset: 3, limit: 10 })
    expect(tools(turn)[2]?.input).toEqual({
      file_path: '/repo/a.ts',
      old_string: 'a',
      new_string: 'b'
    })
  })
})

describe('nativeChatEngineMeta', () => {
  it('reports waiting over working, and the folder paths read relative to', () => {
    const base = { threadId: 'code:t:1', sessionId: 's', cwd: '/repo' }
    expect(nativeChatEngineMeta({ ...base, isWorking: true, awaitingUser: true }).status).toBe(
      'waiting'
    )
    expect(nativeChatEngineMeta({ ...base, isWorking: true, awaitingUser: false })).toMatchObject({
      status: 'working',
      session: { cwd: '/repo', sessionId: 's' }
    })
    expect(nativeChatEngineMeta({ ...base, isWorking: false, awaitingUser: false }).status).toBe(
      'idle'
    )
  })
})

describe('nativeChatEngineTurns model switches', () => {
  const msg = (id: string, role: NativeChatMessage['role'], text: string): NativeChatMessage => ({
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: T0,
    source: 'transcript'
  })

  it('leaves model and effort switches, and their confirmations, out of the thread', () => {
    const { turns } = build({
      messages: [
        msg('m1', 'user', '/model haiku'),
        msg('m2', 'system', 'Set model to `Haiku 5.5` and saved as your default for new sessions'),
        msg('m3', 'user', '<command-name>/effort</command-name><command-args>low</command-args>'),
        msg('m4', 'user', 'hi'),
        msg('m5', 'assistant', 'Hello')
      ]
    })
    expect(turns.map((turn) => turn.user?.text)).toEqual(['hi'])
    expect(turns[0]!.items.map((item) => item.kind)).toEqual(['text'])
  })

  it('keeps a prompt that only mentions a model', () => {
    const { turns } = build({ messages: [msg('m1', 'user', '/modelling notes please')] })
    expect(turns).toHaveLength(1)
  })
})
