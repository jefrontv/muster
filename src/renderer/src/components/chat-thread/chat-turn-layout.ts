// How a turn's items lay out: runs of quiet tool calls share one group row,
// long runs of one-line steps stack under a height cap, and a settled turn
// folds its process rows under a header above the answer.

import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import type { ChatToolItem } from './chat-tool-input'

export type ChatToolCategory = 'read' | 'search' | 'run' | 'web' | 'other'

export type ChatItemRun =
  | { kind: 'item'; item: ChatEngineItem }
  | { kind: 'group'; id: string; items: ChatToolItem[] }

const CATEGORY: Record<string, ChatToolCategory> = {
  Read: 'read',
  NotebookRead: 'read',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  Bash: 'run',
  BashOutput: 'run',
  KillShell: 'run',
  KillBash: 'run',
  WebFetch: 'web',
  WebSearch: 'web'
}

// These show their body by default (diffs, plans, questions), so a group would hide them.
const STANDALONE = new Set([
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
  'TodoWrite',
  'AskUserQuestion',
  'ExitPlanMode'
])

export function toolCategory(name: string): ChatToolCategory {
  return CATEGORY[name] ?? 'other'
}

function groupable(item: ChatEngineItem): item is ChatToolItem {
  return item.kind === 'tool' && !STANDALONE.has(item.name)
}

/** Two or more groupable tool calls in a row become one group, keyed by its first call. */
export function chatItemRuns(items: ChatEngineItem[]): ChatItemRun[] {
  const runs: ChatItemRun[] = []
  let pending: ChatToolItem[] = []
  const flush = (): void => {
    if (pending.length === 1) {
      runs.push({ kind: 'item', item: pending[0]! })
    } else if (pending.length > 1) {
      runs.push({ kind: 'group', id: pending[0]!.id, items: pending })
    }
    pending = []
  }
  for (const item of items) {
    if (groupable(item)) {
      pending.push(item)
      continue
    }
    flush()
    runs.push({ kind: 'item', item })
  }
  flush()
  return runs
}

/** Rows a long run of steps keeps fully visible; older ones fold under the top edge. */
export const CHAT_STACK_VISIBLE_ROWS = 5

export type ChatItemBlock =
  | { kind: 'run'; run: ChatItemRun }
  | { kind: 'stack'; id: string; runs: ChatItemRun[] }

// One-line rows only: text, edits and questions break a stack.
function stackable(run: ChatItemRun): boolean {
  if (run.kind === 'group') {
    return true
  }
  const { item } = run
  return item.kind === 'thinking' || item.kind === 'agent' || groupable(item)
}

/** A run of more one-line steps than fit the stack's height becomes one stack, keyed by its first row. */
export function chatItemBlocks(items: ChatEngineItem[]): ChatItemBlock[] {
  const blocks: ChatItemBlock[] = []
  let pending: ChatItemRun[] = []
  const runId = (run: ChatItemRun): string => (run.kind === 'group' ? run.id : run.item.id)
  const flush = (): void => {
    if (pending.length > CHAT_STACK_VISIBLE_ROWS + 1) {
      blocks.push({ kind: 'stack', id: runId(pending[0]!), runs: pending })
    } else {
      blocks.push(...pending.map((run) => ({ kind: 'run' as const, run })))
    }
    pending = []
  }
  for (const run of chatItemRuns(items)) {
    if (stackable(run)) {
      pending.push(run)
      continue
    }
    flush()
    blocks.push({ kind: 'run', run })
  }
  flush()
  return blocks
}

export function toolIsLive(item: ChatToolItem): boolean {
  return item.status === 'streaming' || item.status === 'running'
}

export type ChatToolGroupSummary = {
  live: boolean
  /** Distinct categories in first-seen order; the live label uses the last one. */
  categories: ChatToolCategory[]
  needsAttention: boolean
}

export function toolGroupSummary(items: ChatToolItem[]): ChatToolGroupSummary {
  const categories: ChatToolCategory[] = []
  for (const item of items) {
    const category = toolCategory(item.name)
    if (!categories.includes(category)) {
      categories.push(category)
    }
  }
  return {
    live: items.some(toolIsLive),
    categories,
    needsAttention: items.some(
      (item) => item.status === 'awaiting-approval' || item.status === 'error'
    )
  }
}

export type ChatTurnFold = {
  process: ChatEngineItem[]
  answer: ChatEngineItem[]
}

/** Only a cleanly finished turn folds; stopped and failed turns stay open to show what happened. */
export function turnFold(turn: ChatEngineTurn): ChatTurnFold | null {
  if (turn.status !== 'done') {
    return null
  }
  const lastText = turn.items.findLastIndex((item) => item.kind === 'text')
  if (lastText <= 0) {
    return null
  }
  return { process: turn.items.slice(0, lastText), answer: turn.items.slice(lastText) }
}

/** The answer text people copy: every text item after the fold point. */
export function answerText(items: ChatEngineItem[]): string {
  return items
    .flatMap((item) => (item.kind === 'text' ? [item.text] : []))
    .join('\n\n')
    .trim()
}
