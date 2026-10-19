// Code mode's conversation (transcript, hook preview and optimistic sends) as
// chat-engine turns, so it draws on the same ChatThreadSurface as Chat mode.
// Pure; previous output goes back in so ids hold and unchanged turns keep identity.

import type { ChatEngineThreadMeta, ChatEngineTurn } from '../../../../shared/chat-engine-types'
import { resolveNativeChatTranscriptAgent } from '../../../../shared/native-chat-agent-support'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'
import { isTextBlock, type NativeChatMessage } from '../../../../shared/native-chat-types'
import { replaceEqualDeep } from '../chat-thread/chat-engine-structural-sharing'
import { formatNativeChatImagePathNote } from './native-chat-file-reference-display'
import { stripNoiseMessages } from './native-chat-noise'
import {
  isInterruptStatusMessage,
  nativeChatEngineTurnItems,
  type NativeChatEngineTurnGroup as Group
} from './native-chat-engine-turn-items'

export type NativeChatEngineTurnsInput = {
  agent: string
  /** Transcript, then the streaming preview, then optimistic sends. */
  messages: readonly NativeChatMessage[]
  /** The view's working decision (hook, pending send, not stopped). */
  isWorking: boolean
  /** A question or approval waits on the user; the turn stays open. */
  awaitingUser: boolean
  /** Sends the agent never received (a failed launch prompt). */
  failedDeliveryMessageIds?: ReadonlySet<string>
  failedDeliveryText: string
  /** Start time for a turn with no timestamps, kept once given. */
  now: number
}

export type NativeChatEngineTurnsState = {
  turns: ChatEngineTurn[]
  /** Transcript user id to the optimistic turn id it replaced, so the row never remounts. */
  aliases: ReadonlyMap<string, string>
}

const LEAD_TURN_ID = 'lead'

const isOptimistic = (message: NativeChatMessage): boolean => message.source === 'scrape'

function groupTurns(messages: readonly NativeChatMessage[]): Group[] {
  const groups: Group[] = []
  for (const message of messages) {
    if (message.role === 'user' && message.id !== NATIVE_CHAT_STREAMING_ID) {
      groups.push({ id: message.id, user: message, messages: [] })
      continue
    }
    const current = groups.at(-1)
    if (current) {
      current.messages.push(message)
    } else {
      groups.push({ id: LEAD_TURN_ID, user: null, messages: [message] })
    }
  }
  return groups
}

function userText(message: NativeChatMessage): string {
  const notes = message.blocks.flatMap((block) =>
    block.type === 'image-ref' && block.path ? [formatNativeChatImagePathNote(block.path)] : []
  )
  const typed = message.blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n\n')
  return [typed, ...notes].filter((part) => part !== '').join('\n')
}

function turnDurationMs(group: Group): { endedAt: number | null; durationMs: number | null } {
  const stamps = group.messages.flatMap((message) =>
    message.timestamp === null ? [] : [message.timestamp]
  )
  const first = stamps[0]
  const last = stamps.at(-1)
  if (first === undefined || last === undefined) {
    return { endedAt: null, durationMs: null }
  }
  return { endedAt: last, durationMs: Math.max(0, last - first) }
}

/** Reuses an optimistic turn's id for the transcript turn that delivered it. */
function resolveTurnIds(
  groups: Group[],
  previous: NativeChatEngineTurnsState | null
): Map<string, string> {
  const aliases = new Map(previous?.aliases ?? [])
  const nextIds = new Set(groups.map((group) => group.id))
  const orphaned = (previous?.turns ?? []).filter(
    (turn) => turn.user?.delivery === 'local' && !nextIds.has(turn.id)
  )
  const known = new Set((previous?.turns ?? []).map((turn) => turn.id))
  for (const group of groups) {
    if (!group.user || isOptimistic(group.user) || known.has(group.id) || aliases.has(group.id)) {
      continue
    }
    const text = userText(group.user)
    const match = orphaned.findIndex((turn) => turn.user?.text === text)
    if (match !== -1) {
      aliases.set(group.id, orphaned[match]!.id)
      orphaned.splice(match, 1)
    }
  }
  for (const id of aliases.keys()) {
    if (!nextIds.has(id)) {
      aliases.delete(id)
    }
  }
  return aliases
}

export function nativeChatEngineTurns(
  input: NativeChatEngineTurnsInput,
  previous: NativeChatEngineTurnsState | null
): NativeChatEngineTurnsState {
  const agent = resolveNativeChatTranscriptAgent(input.agent)
  // The caller already ranks transcript, streaming preview, then optimistic echoes.
  const messages = stripNoiseMessages(input.messages)
  const groups = groupTurns(messages)
  const aliases = resolveTurnIds(groups, previous)
  const previousById = new Map((previous?.turns ?? []).map((turn) => [turn.id, turn]))
  const lastLive =
    input.isWorking ||
    input.awaitingUser ||
    messages.some((message) => message.id === NATIVE_CHAT_STREAMING_ID)
  const turns = groups.map((group, index): ChatEngineTurn => {
    const id = aliases.get(group.id) ?? group.id
    const live = index === groups.length - 1 && lastLive
    const interrupted = group.messages.some(isInterruptStatusMessage)
    const failed =
      group.user !== null && input.failedDeliveryMessageIds?.has(group.user.id) === true
    const items = nativeChatEngineTurnItems(
      { ...group, id },
      { agent, live, interrupted, timestamps: new Map() }
    )
    const { endedAt, durationMs } = turnDurationMs(group)
    const firstStamp =
      group.user?.timestamp ??
      group.messages.find((message) => message.timestamp !== null)?.timestamp
    const turn: ChatEngineTurn = {
      id,
      index,
      user: group.user
        ? {
            text: userText(group.user),
            imageCount: group.user.blocks.filter((block) => block.type === 'image-ref').length,
            sentAt: group.user.timestamp ?? previousById.get(id)?.user?.sentAt ?? input.now,
            delivery: isOptimistic(group.user) ? 'local' : 'delivered',
            uuid: null
          }
        : null,
      items,
      status: failed ? 'error' : live ? 'running' : interrupted ? 'interrupted' : 'done',
      startedAt: firstStamp ?? previousById.get(id)?.startedAt ?? input.now,
      endedAt: live ? null : endedAt,
      durationMs: live ? null : durationMs,
      costUsd: null,
      errorMessage: failed ? input.failedDeliveryText : null,
      toolSummaries: []
    }
    return replaceEqualDeep(previousById.get(id), turn)
  })
  return { turns, aliases }
}

export function nativeChatEngineMeta(input: {
  threadId: string
  sessionId: string | null
  cwd: string | null
  isWorking: boolean
  awaitingUser: boolean
}): ChatEngineThreadMeta {
  return {
    threadId: input.threadId,
    status: input.awaitingUser ? 'waiting' : input.isWorking ? 'working' : 'idle',
    session: {
      sessionId: input.sessionId,
      model: null,
      effort: null,
      permissionMode: null,
      cwd: input.cwd,
      cliVersion: null,
      tools: [],
      slashCommands: [],
      mcpServers: []
    },
    pending: [],
    queue: { items: [], paused: false },
    todos: null,
    suggestions: [],
    contextUsage: null,
    tasks: [],
    totalCostUsd: 0,
    compacting: false,
    lastError: null
  }
}
