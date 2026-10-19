import { describe, expect, it } from 'vitest'
import { pickNativeChatTakeover } from './native-chat-takeover-precedence'
import { planSummary } from './native-chat-plan-summary'

const bash = { requestId: 'a', toolName: 'Bash', input: {} }
const edit = { requestId: 'b', toolName: 'Edit', input: {} }
const ask = { requestId: 'q', toolName: 'AskUserQuestion', input: {} }
const plan = { requestId: 'p', toolName: 'ExitPlanMode', input: { plan: '# Plan' } }

describe('pickNativeChatTakeover', () => {
  it('is empty without requests', () => {
    expect(pickNativeChatTakeover(undefined)).toEqual({
      plan: null,
      question: null,
      composerRequest: null,
      composerRequestCount: 0
    })
  })

  it('puts plan review ahead of a question and approvals', () => {
    const pick = pickNativeChatTakeover([bash, ask, plan])
    expect(pick.plan).toBe(plan)
    expect(pick.question).toBe(ask)
    expect(pick.composerRequest).toBe(plan)
  })

  it('finds a question queued behind an approval', () => {
    const pick = pickNativeChatTakeover([bash, ask])
    expect(pick.plan).toBeNull()
    expect(pick.question).toBe(ask)
    expect(pick.composerRequest).toBe(bash)
  })

  it('never hands a question to the composer, and counts only approvals', () => {
    const pick = pickNativeChatTakeover([ask, bash, edit])
    expect(pick.composerRequest).toBe(bash)
    expect(pick.composerRequestCount).toBe(2)
  })
})

describe('planSummary', () => {
  it('reads the first line as the title and the next paragraph as the lead', () => {
    expect(
      planSummary({ plan: '\n## 1. Fix [the bug](x)\n\n- Edit `a.ts`\n- Run tests\n\nLater' })
    ).toEqual({ title: '1. Fix the bug', description: 'Edit a.ts Run tests' })
  })

  it('skips fences before the lead', () => {
    expect(planSummary({ plan: 'Title\n\n```\ncode\n```' })).toEqual({
      title: 'Title',
      description: 'code'
    })
  })

  it('is empty for a missing plan', () => {
    expect(planSummary(null)).toEqual({ title: '', description: '' })
    expect(planSummary({ plan: 3 })).toEqual({ title: '', description: '' })
  })
})
