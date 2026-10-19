// How a turn's items lay out: runs of quiet tool calls share one group row,
// and a settled turn folds its process rows under a header above the answer.

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
