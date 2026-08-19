import { describe, expect, it } from 'vitest'
import type { NativeChatMessage, NativeChatRole } from '../../../../shared/native-chat-types'
import {
  deriveNativeChatTurnPlan,
  nativeChatPlanActiveLabel,
  parseTodoWriteSteps
} from './native-chat-turn-plan'

function todoMsg(id: string, todos: unknown): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'tool-call', name: 'TodoWrite', input: { todos } }],
    timestamp: null,
    source: 'transcript'
  }
}

function msg(id: string, role: NativeChatRole, text: string): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: null, source: 'transcript' }
}

const THREE_STEPS = [
  { content: 'Read the file', activeForm: 'Reading the file', status: 'completed' },
  { content: 'Add the parser', activeForm: 'Adding the parser', status: 'in_progress' },
  { content: 'Write tests', activeForm: 'Writing tests', status: 'pending' }
]

describe('parseTodoWriteSteps', () => {
  it('reads content, active form and status', () => {
    expect(parseTodoWriteSteps({ todos: THREE_STEPS })).toEqual([
      { content: 'Read the file', activeForm: 'Reading the file', status: 'completed' },
      { content: 'Add the parser', activeForm: 'Adding the parser', status: 'in_progress' },
      { content: 'Write tests', activeForm: 'Writing tests', status: 'pending' }
    ])
  })

  it('returns null for anything that is not a todos array', () => {
    // `input` is typed unknown, so every one of these can reach the parser.
    expect(parseTodoWriteSteps(null)).toBeNull()
    expect(parseTodoWriteSteps('todos')).toBeNull()
    expect(parseTodoWriteSteps({})).toBeNull()
    expect(parseTodoWriteSteps({ todos: 'nope' })).toBeNull()
  })

  it('drops entries with no usable text rather than rendering blank rows', () => {
    const steps = parseTodoWriteSteps({
      todos: [{ content: '   ' }, null, 'string', { content: 'Real step' }]
    })
    expect(steps).toEqual([{ content: 'Real step', activeForm: null, status: 'pending' }])
  })

  it('treats an unknown status as pending', () => {
    expect(parseTodoWriteSteps({ todos: [{ content: 'x', status: 'wat' }] })?.[0]?.status).toBe(
      'pending'
    )
  })
})

describe('deriveNativeChatTurnPlan', () => {
  it('returns null when the turn never published a plan', () => {
    expect(deriveNativeChatTurnPlan([msg('u1', 'user', 'hi'), msg('a1', 'assistant', 'ok')])).toBe(
      null
    )
  })

  it('counts completed steps and points at the running one', () => {
    const plan = deriveNativeChatTurnPlan([msg('u1', 'user', 'go'), todoMsg('a1', THREE_STEPS)])
    expect(plan?.completedCount).toBe(1)
    expect(plan?.activeIndex).toBe(1)
    expect(nativeChatPlanActiveLabel(plan)).toBe('Adding the parser')
  })

  it('takes the last call, since the agent rewrites the whole list each time', () => {
    const plan = deriveNativeChatTurnPlan([
      todoMsg('a1', THREE_STEPS),
      todoMsg('a2', [{ content: 'Only step', status: 'completed' }])
    ])
    expect(plan?.steps).toHaveLength(1)
    expect(plan?.completedCount).toBe(1)
  })

  it('lets a later empty list retract the plan instead of freezing it', () => {
    expect(deriveNativeChatTurnPlan([todoMsg('a1', THREE_STEPS), todoMsg('a2', [])])).toBe(null)
  })

  it('falls back to the first pending step when nothing is in progress', () => {
    const plan = deriveNativeChatTurnPlan([
      todoMsg('a1', [
        { content: 'Done thing', status: 'completed' },
        { content: 'Next thing', status: 'pending' }
      ])
    ])
    expect(plan?.activeIndex).toBe(1)
    // No activeForm supplied, so the imperative content is the label.
    expect(nativeChatPlanActiveLabel(plan)).toBe('Next thing')
  })

  it('has no active step once every step is complete', () => {
    const plan = deriveNativeChatTurnPlan([
      todoMsg('a1', [{ content: 'Only step', status: 'completed' }])
    ])
    expect(plan?.activeIndex).toBeNull()
    expect(nativeChatPlanActiveLabel(plan)).toBeNull()
  })

  it('ignores tool calls that are not TodoWrite', () => {
    const other: NativeChatMessage = {
      id: 'a1',
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'Read', input: { todos: THREE_STEPS } }],
      timestamp: null,
      source: 'transcript'
    }
    expect(deriveNativeChatTurnPlan([other])).toBeNull()
  })
})
