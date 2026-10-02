// One turn's work, as the work log draws it: paired call/result rows in call
// order, runs of reads and searches grouped, thinking kept out of the prose,
// and ActiveCollab writes lifted out as outcome chips. Pure; the same input
// gives the same rows whether the turn is live or settled.

import {
  activeCollabToolEvent,
  type ActiveCollabToolEvent
} from '../../../../shared/native-chat-activecollab-events'
import { describeToolActivity } from '../../../../shared/native-chat-tool-activity'
import type {
  NativeChatSurface,
  NativeChatToolActivity,
  NativeChatTranslate
} from '../../../../shared/native-chat-tool-activity-types'
import { describeExploreGroup } from '../../../../shared/native-chat-work-summary'
import { pairToolBlocks } from '../../../../shared/native-chat-tool-fold'
import {
  isTextBlock,
  type NativeChatBlock,
  type NativeChatMessage,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../../../../shared/native-chat-types'

export type NativeChatWorkToolEntry = {
  kind: 'tool'
  key: string
  call: NativeChatToolCallBlock | undefined
  result: NativeChatToolResultBlock | undefined
  activity: NativeChatToolActivity
  /** The call is still out in the live turn. */
  running: boolean
}

export type NativeChatWorkEntry =
  | NativeChatWorkToolEntry
  | { kind: 'explore'; key: string; label: string; entries: NativeChatWorkToolEntry[] }
  | { kind: 'thinking'; key: string; text: string }

export type NativeChatTurnWork = {
  entries: NativeChatWorkEntry[]
  /** Every visible activity, grouped or not, for counts and the changes card. */
  activities: NativeChatToolActivity[]
  events: ActiveCollabToolEvent[]
  /** Present-tense label of the newest call still out, for the live status line. */
  liveLabel: string | null
}

const EXPLORE_GROUPS = new Set(['read', 'search'])

export function isWorkBlock(block: NativeChatBlock): boolean {
  return block.type === 'tool-call' || block.type === 'tool-result'
}

/** Messages that put something in the work log rather than the prose. */
export function messageHasWork(message: NativeChatMessage): boolean {
  return message.role === 'reasoning' || message.blocks.some(isWorkBlock)
}

function groupExploration(
  entries: NativeChatWorkEntry[],
  surface: NativeChatSurface,
  t: NativeChatTranslate | undefined
): NativeChatWorkEntry[] {
  const grouped: NativeChatWorkEntry[] = []
  let run: NativeChatWorkToolEntry[] = []
  const flush = (): void => {
    if (run.length > 1) {
      const activities = run.map((entry) => entry.activity)
      grouped.push({
        kind: 'explore',
        key: `explore:${run[0]!.key}`,
        label: describeExploreGroup(activities, surface, t),
        entries: run
      })
    } else if (run.length === 1) {
      grouped.push(run[0]!)
    }
    run = []
  }
  for (const entry of entries) {
    if (entry.kind === 'tool' && EXPLORE_GROUPS.has(entry.activity.group) && !entry.running) {
      run.push(entry)
      continue
    }
    flush()
    grouped.push(entry)
  }
  flush()
  return grouped
}

export function deriveNativeChatTurnWork(
  messages: readonly NativeChatMessage[],
  options: {
    surface: NativeChatSurface
    live: boolean
    t?: NativeChatTranslate
    cwd?: string | null
  }
): NativeChatTurnWork {
  const { surface, live, t, cwd } = options
  const blocks: NativeChatBlock[] = []
  const timestamps = new Map<NativeChatBlock, number | null>()
  const ordered: (NativeChatBlock | { thinking: string; key: string })[] = []
  for (const message of messages) {
    if (message.role === 'reasoning') {
      const text = message.blocks.map((block) => (isTextBlock(block) ? block.text : '')).join('')
      if (surface === 'code' && text.trim() !== '') {
        ordered.push({ thinking: text, key: `thinking:${message.id}` })
      }
      continue
    }
    for (const block of message.blocks) {
      if (isWorkBlock(block)) {
        blocks.push(block)
        timestamps.set(block, message.timestamp)
        if (block.type === 'tool-call') {
          ordered.push(block)
        }
      }
    }
  }
  const pairs = pairToolBlocks(blocks)
  const pairByCall = new Map(pairs.flatMap((pair) => (pair.call ? [[pair.call, pair]] : [])))
  const events: ActiveCollabToolEvent[] = []
  const activities: NativeChatToolActivity[] = []
  const entries: NativeChatWorkEntry[] = []
  let liveLabel: string | null = null
  ordered.forEach((item, index) => {
    if ('thinking' in item) {
      entries.push({ kind: 'thinking', key: item.key, text: item.thinking })
      return
    }
    const call = item as NativeChatToolCallBlock
    const event = activeCollabToolEvent(call.name, call.input)
    if (event) {
      events.push(event)
      return
    }
    const result = pairByCall.get(call)?.result
    const startedAt = timestamps.get(call) ?? null
    const endedAt = result ? (timestamps.get(result) ?? null) : null
    const activity = describeToolActivity(call, result, surface, {
      ...(t ? { t } : {}),
      cwd: cwd ?? null,
      elapsedMs: startedAt !== null && endedAt !== null ? endedAt - startedAt : null
    })
    if (activity.hidden) {
      return
    }
    const running = live && result === undefined
    if (running) {
      liveLabel = activity.liveLabel
    }
    activities.push(activity)
    entries.push({ kind: 'tool', key: call.id ?? `call:${index}`, call, result, activity, running })
  })
  return { entries: groupExploration(entries, surface, t), activities, events, liveLabel }
}
