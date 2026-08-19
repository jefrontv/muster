// Reads a turn's TodoWrite calls into the plan the timeline shows.
//
// Why this exists: TodoWrite is how the agent narrates its own intent, and
// today it renders as the bare string "Updating the plan" and is then swallowed
// by the turn fold. For a Chat-mode user who will not read a tool call, the
// checklist is the clearest available answer to "what is it doing, and how far
// through is it".
//
// The agent rewrites the whole list on every call, so the last call in a turn
// wins. A later call with an empty list retracts the plan outright — otherwise
// a withdrawn plan would freeze on screen for the rest of the turn.

import { isToolCallBlock, type NativeChatMessage } from '../../../../shared/native-chat-types'

export const TODO_WRITE_TOOL_NAME = 'TodoWrite'

export type NativeChatPlanStepStatus = 'pending' | 'in_progress' | 'completed'

export type NativeChatPlanStep = {
  /** Imperative form, e.g. "Add the parser". */
  content: string
  /** Present-tense form the agent supplies for the running step. */
  activeForm: string | null
  status: NativeChatPlanStepStatus
}

export type NativeChatTurnPlan = {
  steps: readonly NativeChatPlanStep[]
  completedCount: number
  /** Index of the in-progress step, else the first pending one, else null. */
  activeIndex: number | null
}

function asStatus(value: unknown): NativeChatPlanStepStatus {
  return value === 'completed' || value === 'in_progress' ? value : 'pending'
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * `input` is `unknown` by design (every tool's shape differs), so this narrows
 * defensively: anything without usable step text is dropped rather than
 * rendered as an empty row.
 */
export function parseTodoWriteSteps(input: unknown): NativeChatPlanStep[] | null {
  if (typeof input !== 'object' || input === null) {
    return null
  }
  const todos = (input as { todos?: unknown }).todos
  if (!Array.isArray(todos)) {
    return null
  }
  const steps: NativeChatPlanStep[] = []
  for (const todo of todos) {
    if (typeof todo !== 'object' || todo === null) {
      continue
    }
    const record = todo as { content?: unknown; activeForm?: unknown; status?: unknown }
    const content = asTrimmedString(record.content)
    if (content === null) {
      continue
    }
    steps.push({
      content,
      activeForm: asTrimmedString(record.activeForm),
      status: asStatus(record.status)
    })
  }
  return steps
}

function activeIndexOf(steps: readonly NativeChatPlanStep[]): number | null {
  const running = steps.findIndex((step) => step.status === 'in_progress')
  if (running !== -1) {
    return running
  }
  const pending = steps.findIndex((step) => step.status === 'pending')
  return pending === -1 ? null : pending
}

/** The plan for one turn, or null when the turn has none (or retracted it). */
export function deriveNativeChatTurnPlan(
  messages: readonly NativeChatMessage[]
): NativeChatTurnPlan | null {
  let latest: NativeChatPlanStep[] | null = null
  for (const message of messages) {
    for (const block of message.blocks) {
      if (!isToolCallBlock(block) || block.name !== TODO_WRITE_TOOL_NAME) {
        continue
      }
      const parsed = parseTodoWriteSteps(block.input)
      if (parsed !== null) {
        latest = parsed
      }
    }
  }
  if (latest === null || latest.length === 0) {
    return null
  }
  return {
    steps: latest,
    completedCount: latest.filter((step) => step.status === 'completed').length,
    activeIndex: activeIndexOf(latest)
  }
}

/** What the working row says the agent is doing right now. */
export function nativeChatPlanActiveLabel(plan: NativeChatTurnPlan | null): string | null {
  if (plan === null || plan.activeIndex === null) {
    return null
  }
  const step = plan.steps[plan.activeIndex]
  return step === undefined ? null : (step.activeForm ?? step.content)
}
