import { describe, expect, it } from 'vitest'
import type { ChatEngineItem } from '../../../shared/chat-engine-types'
import { ChatEngine } from './chat-engine'

const T = 't1'

function engineAt(start = 1_000): { engine: ChatEngine; tick: (ms: number) => void } {
  let now = start
  return { engine: new ChatEngine({ now: () => now }), tick: (ms) => (now += ms) }
}

const stream = (event: Record<string, unknown>, parent?: string) => ({
  type: 'stream_event',
  event,
  ...(parent ? { parent_tool_use_id: parent } : {})
})
const assistant = (id: string, block: Record<string, unknown>, index: number, parent?: string) => ({
  type: 'assistant',
  apiBlockIndex: index,
  message: { id, role: 'assistant', content: [block] },
  ...(parent ? { parent_tool_use_id: parent } : {})
})
const toolResult = (toolUseId: string, content: string, structured?: unknown, isError = false) => ({
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }]
  },
  ...(structured ? { tool_use_result: structured } : {})
})
const result = (extra: Record<string, unknown> = {}) => ({
  type: 'result',
  subtype: 'success',
  duration_ms: 4_200,
  total_cost_usd: 0.12,
  is_error: false,
  ...extra
})

function turns(engine: ChatEngine) {
  return engine.snapshot(T)?.turns ?? []
}
function items(engine: ChatEngine, turn = -1): ChatEngineItem[] {
  return turns(engine).at(turn)?.items ?? []
}

describe('ChatEngineThread', () => {
  it('streams text into one item and settles the turn on result', () => {
    const { engine, tick } = engineAt()
    engine.userMessage(T, {
      id: 'u-1',
      text: 'Why does the menu overlap?',
      imageCount: 0,
      steer: false
    })
    engine.ingest(T, {
      type: 'user',
      uuid: 'u-1',
      message: { role: 'user', content: 'Why does the menu overlap?' }
    })
    engine.ingest(T, stream({ type: 'message_start', message: { id: 'm1' } }))
    engine.ingest(
      T,
      stream({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
    )
    engine.ingest(
      T,
      stream({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'The panel ' }
      })
    )
    engine.ingest(
      T,
      stream({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'uses 100vh.' }
      })
    )
    expect(engine.snapshot(T)?.meta.status).toBe('working')
    expect(items(engine)).toEqual([
      { kind: 'text', id: 'm1#0', text: 'The panel uses 100vh.', streaming: true }
    ])

    engine.ingest(T, assistant('m1', { type: 'text', text: 'The panel uses 100vh.' }, 0))
    tick(4_000)
    engine.ingest(T, result())

    const [turn] = turns(engine)
    expect(turn?.user).toMatchObject({ delivery: 'delivered', uuid: 'u-1' })
    expect(turn).toMatchObject({ status: 'done', durationMs: 4_200, costUsd: 0.12 })
    expect(turn?.items).toEqual([
      { kind: 'text', id: 'm1#0', text: 'The panel uses 100vh.', streaming: false }
    ])
    expect(engine.snapshot(T)?.meta).toMatchObject({ status: 'idle', totalCostUsd: 0.12 })
  })

  it('tracks a tool from streamed input through approval to a structured diff', () => {
    const { engine } = engineAt()
    engine.userMessage(T, { id: 'local-97', text: 'Fix it', imageCount: 0, steer: false })
    engine.ingest(T, stream({ type: 'message_start', message: { id: 'm2' } }))
    engine.ingest(
      T,
      stream({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tu1', name: 'Edit' }
      })
    )
    engine.ingest(
      T,
      stream({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"file_path":"a.scss",' }
      })
    )
    expect(items(engine)[0]).toMatchObject({ kind: 'tool', status: 'streaming' })
    engine.ingest(
      T,
      stream({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '"old_string":"100vh","new_string":"100dvh"}'
        }
      })
    )
    engine.ingest(T, stream({ type: 'content_block_stop', index: 0 }))
    expect(items(engine)[0]).toMatchObject({
      status: 'running',
      input: { file_path: 'a.scss', new_string: '100dvh' }
    })

    engine.ingest(T, {
      type: 'control_request',
      request_id: 'perm-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Edit',
        tool_use_id: 'tu1',
        input: { file_path: 'a.scss' },
        title: 'Edit a.scss?'
      }
    })
    expect(engine.snapshot(T)?.meta.status).toBe('waiting')
    expect(engine.snapshot(T)?.meta.pending).toMatchObject([
      { requestId: 'perm-1', kind: 'permission', title: 'Edit a.scss?' }
    ])
    expect(items(engine)[0]).toMatchObject({ status: 'awaiting-approval' })

    engine.resolvePermission(T, 'perm-1', 'allow')
    expect(engine.snapshot(T)?.meta.pending).toEqual([])
    expect(items(engine)[0]).toMatchObject({ status: 'running' })

    engine.ingest(
      T,
      toolResult('tu1', 'Updated a.scss', {
        filePath: 'a.scss',
        structuredPatch: [
          {
            oldStart: 38,
            oldLines: 1,
            newStart: 38,
            newLines: 3,
            lines: ['-  height: 100vh;', '+  height: 100dvh;', '+  &.is-open {', ' }']
          }
        ]
      })
    )
    expect(items(engine)[0]).toMatchObject({
      status: 'done',
      result: { isError: false, additions: 2, deletions: 1, patch: [{ oldStart: 38, newLines: 3 }] }
    })
  })

  it('classifies questions and plans, and voids a request the CLI cancels', () => {
    const { engine } = engineAt()
    engine.userMessage(T, { id: 'local-177', text: 'Plan it', imageCount: 0, steer: false })
    engine.ingest(T, {
      type: 'control_request',
      request_id: 'q1',
      request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: { questions: [] } }
    })
    engine.ingest(T, {
      type: 'control_request',
      request_id: 'p1',
      request: { subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan: '1. Do it' } }
    })
    expect(engine.snapshot(T)?.meta.pending.map((entry) => entry.kind)).toEqual([
      'question',
      'plan'
    ])
    engine.ingest(T, { type: 'control_cancel_request', request_id: 'q1' })
    expect(engine.snapshot(T)?.meta.pending.map((entry) => entry.requestId)).toEqual(['p1'])
  })

  it('nests subagent output under its agent block', () => {
    const { engine } = engineAt()
    engine.userMessage(T, { id: 'local-198', text: 'Look around', imageCount: 0, steer: false })
    engine.ingest(
      T,
      assistant(
        'm3',
        {
          type: 'tool_use',
          id: 'ag1',
          name: 'Agent',
          input: { description: 'Compare spacing', subagent_type: 'Explore' }
        },
        0
      )
    )
    engine.ingest(
      T,
      assistant(
        's1',
        { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'x.php' } },
        0,
        'ag1'
      )
    )
    engine.ingest(T, {
      type: 'system',
      subtype: 'task_progress',
      tool_use_id: 'ag1',
      summary: 'Reading the contact page'
    })
    const agent = items(engine)[0]
    expect(agent).toMatchObject({
      kind: 'agent',
      description: 'Compare spacing',
      subagentType: 'Explore',
      summary: 'Reading the contact page'
    })
    expect(agent?.kind === 'agent' ? agent.items : []).toMatchObject([
      { kind: 'tool', id: 'r1', name: 'Read' }
    ])

    engine.ingest(T, toolResult('ag1', 'The form margin is 24px.'))
    expect(items(engine)[0]).toMatchObject({ kind: 'agent', status: 'done' })
  })

  it('tracks tasks from start to notification, and background commands without a block', () => {
    const { engine } = engineAt()
    engine.userMessage(T, { id: 'local-244', text: 'Go', imageCount: 0, steer: false })
    engine.ingest(T, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't1',
      tool_use_id: 'ag1',
      task_type: 'local_agent',
      description: 'Compare spacing',
      subagent_type: 'Explore'
    })
    engine.ingest(T, {
      type: 'system',
      subtype: 'task_started',
      task_id: 't2',
      tool_use_id: 'b1',
      task_type: 'local_bash',
      description: 'npm run dev'
    })
    engine.ingest(T, {
      type: 'system',
      subtype: 'task_progress',
      task_id: 't1',
      description: 'Compare spacing',
      summary: 'Reading the contact page',
      usage: { total_tokens: 900, tool_uses: 3, duration_ms: 4000 }
    })
    engine.ingest(T, {
      type: 'system',
      subtype: 'task_notification',
      task_id: 't1',
      status: 'completed',
      summary: 'Margin is 24px',
      output_file: ''
    })
    engine.ingest(T, {
      type: 'system',
      subtype: 'task_updated',
      task_id: 't2',
      patch: { status: 'killed' }
    })
    expect(engine.snapshot(T)?.meta.tasks).toMatchObject([
      {
        taskId: 't1',
        toolUseId: 'ag1',
        type: 'local_agent',
        subagentType: 'Explore',
        status: 'done',
        summary: 'Margin is 24px',
        toolUses: 3
      },
      { taskId: 't2', toolUseId: 'b1', type: 'local_bash', status: 'stopped' }
    ])
  })

  it('keeps the latest todo list and structured command output', () => {
    const { engine } = engineAt()
    engine.userMessage(T, { id: 'local-300', text: 'Go', imageCount: 0, steer: false })
    engine.ingest(
      T,
      assistant(
        'm4',
        {
          type: 'tool_use',
          id: 'td',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Fix menu', activeForm: 'Fixing menu', status: 'completed' },
              { content: 'Run tests', activeForm: 'Running tests', status: 'in_progress' }
            ]
          }
        },
        0
      )
    )
    expect(engine.snapshot(T)?.meta.todos).toEqual([
      { content: 'Fix menu', activeForm: 'Fixing menu', status: 'completed' },
      { content: 'Run tests', activeForm: 'Running tests', status: 'in_progress' }
    ])
    engine.ingest(
      T,
      assistant(
        'm4',
        { type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npx stylelint' } },
        1
      )
    )
    engine.ingest(
      T,
      toolResult(
        'b1',
        'error',
        {
          stdout: '',
          stderr: '42:5 Expected variable',
          interrupted: false,
          returnCodeInterpretation: 'exit 2'
        },
        true
      )
    )
    expect(items(engine).find((item) => item.id === 'b1')).toMatchObject({
      status: 'error',
      result: { stderr: '42:5 Expected variable', exitInterpretation: 'exit 2', isError: true }
    })
  })

  it('steers: a mid-turn send closes the previous turn and replays match in order', () => {
    const { engine, tick } = engineAt()
    engine.userMessage(T, { id: 'u-a', text: 'First', imageCount: 0, steer: false })
    tick(1_000)
    engine.userMessage(T, { id: 'u-b', text: 'Also this', imageCount: 0, steer: false })
    expect(turns(engine).map((turn) => turn.status)).toEqual(['done', 'running'])
    engine.ingest(T, { type: 'user', uuid: 'u-a', message: { role: 'user', content: 'First' } })
    engine.ingest(T, { type: 'user', uuid: 'u-b', message: { role: 'user', content: 'Also this' } })
    expect(turns(engine).map((turn) => turn.user?.uuid)).toEqual(['u-a', 'u-b'])
  })

  it('interrupts running work when the process exits', () => {
    const { engine } = engineAt()
    const control = engine.attachProcess(T, () => true)
    engine.userMessage(T, { id: 'local-365', text: 'Go', imageCount: 0, steer: false })
    engine.ingest(
      T,
      assistant(
        'm5',
        { type: 'tool_use', id: 'b2', name: 'Bash', input: { command: 'sleep 60' } },
        0
      )
    )
    engine.ingest(T, {
      type: 'control_request',
      request_id: 'x',
      request: { subtype: 'can_use_tool', tool_name: 'Bash', tool_use_id: 'b2', input: {} }
    })
    engine.processExited(T, control, { stopping: false, error: 'killed' })
    const snapshot = engine.snapshot(T)
    expect(snapshot?.meta).toMatchObject({ status: 'stopped', pending: [], lastError: 'killed' })
    expect(snapshot?.turns.at(-1)).toMatchObject({ status: 'interrupted' })
    expect(items(engine)[0]).toMatchObject({ status: 'interrupted' })
  })

  it('ignores Claude Code plumbing messages and stores thinking separately', () => {
    const { engine } = engineAt()
    engine.ingest(T, {
      type: 'user',
      message: { role: 'user', content: '<command-name>/compact</command-name>' }
    })
    expect(turns(engine)).toEqual([])
    engine.userMessage(T, { id: 'local-393', text: 'Think', imageCount: 0, steer: false })
    engine.ingest(T, stream({ type: 'message_start', message: { id: 'm6' } }))
    engine.ingest(
      T,
      stream({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } })
    )
    engine.ingest(
      T,
      stream({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Check the header.' }
      })
    )
    expect(items(engine)[0]).toEqual({
      kind: 'thinking',
      id: 'm6#0',
      text: 'Check the header.',
      streaming: true
    })
  })
})
