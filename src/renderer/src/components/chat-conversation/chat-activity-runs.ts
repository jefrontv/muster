// Ported from the muster-bots fork (src/lib/activity-runs.ts), Apache-2.0.
// Finished tool calls in a row fold into one pill; anything live, failed or
// carrying a body worth seeing (diffs, plans, questions) keeps its own card.

import { translate } from '@/i18n/i18n'
import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import type { ChatToolItem } from '@/components/chat-thread/chat-tool-input'
import { formatElapsed, mcpToolParts } from '@/components/chat-thread/chat-tool-row-model'

type ItemOf<K extends ChatEngineItem['kind']> = Extract<ChatEngineItem, { kind: K }>

export type ChatProcessBlock =
  | { kind: 'run'; id: string; items: ChatToolItem[] }
  | { kind: 'tool'; item: ChatToolItem }
  | { kind: 'thinking'; item: ItemOf<'thinking'> }
  | { kind: 'agent'; item: ItemOf<'agent'> }
  | { kind: 'notice'; item: ItemOf<'notice'> }
  | { kind: 'message'; item: ItemOf<'text'> | ItemOf<'steer'> }

const STANDALONE = new Set([
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
  'TodoWrite',
  'AskUserQuestion',
  'ExitPlanMode'
])

export function foldsIntoRun(item: ChatEngineItem): item is ChatToolItem {
  return item.kind === 'tool' && item.status === 'done' && !STANDALONE.has(item.name)
}

function single(item: ChatEngineItem): ChatProcessBlock {
  switch (item.kind) {
    case 'tool':
      return { kind: 'tool', item }
    case 'thinking':
      return { kind: 'thinking', item }
    case 'agent':
      return { kind: 'agent', item }
    case 'notice':
      return { kind: 'notice', item }
    case 'text':
    case 'steer':
      return { kind: 'message', item }
  }
}

/** Two or more finished calls in a row become one run, keyed by its first call. */
export function chatProcessBlocks(items: ChatEngineItem[]): ChatProcessBlock[] {
  const blocks: ChatProcessBlock[] = []
  let run: ChatToolItem[] = []
  const flush = (): void => {
    if (run.length > 1) {
      blocks.push({ kind: 'run', id: run[0]!.id, items: run })
    } else if (run.length === 1) {
      blocks.push({ kind: 'tool', item: run[0]! })
    }
    run = []
  }
  for (const item of items) {
    if (foldsIntoRun(item)) {
      run.push(item)
      continue
    }
    flush()
    blocks.push(single(item))
  }
  flush()
  return blocks
}

/** The name a run pill shows: the CLI tool name, or the MCP tool without its server prefix. */
export function toolDisplayName(name: string): string {
  return mcpToolParts(name)?.tool ?? name
}

const MAX_NAMES = 3

/** "4 steps: Read ×2, Grep, Bash" with names past the third counted as "+N more". */
export function describeRun(items: ChatToolItem[]): string {
  const counts = new Map<string, number>()
  for (const item of items) {
    const name = toolDisplayName(item.name)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const names = [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
  const shown = names.slice(0, MAX_NAMES).join(', ')
  const rest =
    names.length > MAX_NAMES
      ? ` ${translate('components.chat-conversation.runMore', '+{{count}} more', {
          count: names.length - MAX_NAMES
        })}`
      : ''
  return translate('components.chat-conversation.runSteps', '{{count}} steps: {{tools}}', {
    count: items.length,
    tools: `${shown}${rest}`
  })
}

type SettledTurn = Pick<ChatEngineTurn, 'status' | 'durationMs'>

/** The fold pill: "Worked for 29s", or "Stopped" and "Failed" for turns that did not finish. */
export function turnFoldLabel(turn: SettledTurn): string {
  if (turn.status === 'interrupted') {
    return translate('components.chat-thread.turnInterrupted', 'Stopped')
  }
  if (turn.status === 'error') {
    return translate('components.chat-thread.turnFailedLabel', 'Failed')
  }
  if (!turn.durationMs || turn.durationMs < 1000) {
    return translate('components.chat-conversation.worked', 'Worked')
  }
  return translate('components.chat-conversation.workedFor', 'Worked for {{duration}}', {
    duration: formatElapsed(turn.durationMs / 1000)
  })
}
