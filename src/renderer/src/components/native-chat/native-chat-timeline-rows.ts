// Flattens the ordered message array into the rows the timeline renders. One
// visibility rule for live and settled turns: prose always shows, all tool
// activity lives in the turn's single work log, and the plan, changes card and
// error hang off the turn. Pure derivation; the list owns the toggle state.

import {
  isImageRefBlock,
  isTextBlock,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'
import type {
  NativeChatSurface,
  NativeChatTranslate
} from '../../../../shared/native-chat-tool-activity-types'
import {
  deriveNativeChatTurnStates,
  groupNativeChatTurns,
  isInterruptStatusMessage,
  type NativeChatTurn
} from './native-chat-turn-folds'
import { deriveNativeChatTurnPlan, type NativeChatTurnPlan } from './native-chat-turn-plan'
import {
  deriveNativeChatTurnChangedFiles,
  shouldAutoExpandChangedFiles,
  type NativeChatTurnChangedFiles
} from './native-chat-turn-changed-files'
import {
  deriveNativeChatTurnWork,
  messageHasWork,
  type NativeChatTurnWork
} from './native-chat-turn-work'

/** hidden: Chat mode's live turn (the status line speaks for it); collapsed: header only. */
export type NativeChatWorkLogPresentation = 'hidden' | 'collapsed' | 'open'

export type NativeChatTimelineRow =
  | {
      kind: 'message'
      key: string
      message: NativeChatMessage
      /** The newest assistant reply in the thread: its actions show without hover. */
      isLatestReply: boolean
      /** Final assistant reply of a settled turn: gets Copy and Retry. */
      showReplyActions: boolean
    }
  | {
      kind: 'work-log'
      key: string
      turnId: string
      work: NativeChatTurnWork
      live: boolean
      presentation: NativeChatWorkLogPresentation
      durationMs: number | null
      interrupted: boolean
    }
  | {
      kind: 'turn-changed-files'
      key: string
      turnId: string
      changed: NativeChatTurnChangedFiles
      expanded: boolean
    }
  | { kind: 'turn-plan'; key: string; turnId: string; plan: NativeChatTurnPlan; expanded: boolean }
  | { kind: 'turn-error'; key: string; turnId: string; message: string }

export type NativeChatTimelineToggles = {
  /** Work logs the user flipped from their default (open live in Code, folded when settled). */
  workLogs?: ReadonlySet<string>
  plans?: ReadonlySet<string>
  changedFiles?: ReadonlySet<string>
}

/** Live and settled flips are tracked apart, so collapsing a live log never opens it on settle. */
export function nativeChatWorkLogToggleKey(turnId: string, live: boolean): string {
  return live ? `${turnId}:live` : turnId
}

/** The single rule both live and settled turns follow. */
export function nativeChatWorkLogPresentation(input: {
  surface: NativeChatSurface
  live: boolean
  toggled: boolean
}): NativeChatWorkLogPresentation {
  if (input.live) {
    if (input.surface === 'chat') {
      return 'hidden'
    }
    return input.toggled ? 'collapsed' : 'open'
  }
  return input.toggled ? 'open' : 'collapsed'
}

function hasProse(message: NativeChatMessage): boolean {
  return message.blocks.some(
    (block) => (isTextBlock(block) && block.text.trim() !== '') || isImageRefBlock(block)
  )
}

/** Rows the message itself draws: never reasoning or the raw interrupt line. */
function rendersAsMessage(message: NativeChatMessage): boolean {
  if (message.role === 'reasoning' || isInterruptStatusMessage(message)) {
    return false
  }
  return message.role === 'user' || hasProse(message)
}

type TurnContext = {
  turn: NativeChatTurn
  live: boolean
  durationMs: number | null
  interrupted: boolean
  isLastTurn: boolean
}

function pushTurnRows(
  rows: NativeChatTimelineRow[],
  context: TurnContext,
  input: Parameters<typeof buildNativeChatTimelineRows>[0]
): void {
  const { turn, live } = context
  const toggles = input.toggles ?? {}
  const work = deriveNativeChatTurnWork(turn.messages, {
    surface: input.surface,
    live,
    ...(input.t ? { t: input.t } : {}),
    cwd: input.cwd ?? null
  })
  const hasLog = work.entries.length > 0 || work.events.length > 0 || context.interrupted
  const workRow: NativeChatTimelineRow | null = hasLog
    ? {
        kind: 'work-log',
        key: `work:${turn.id}`,
        turnId: turn.id,
        work,
        live,
        presentation: nativeChatWorkLogPresentation({
          surface: input.surface,
          live,
          toggled: toggles.workLogs?.has(nativeChatWorkLogToggleKey(turn.id, live)) === true
        }),
        durationMs: context.durationMs,
        interrupted: context.interrupted
      }
    : null
  const plan = deriveNativeChatTurnPlan(turn.messages)
  const finalReply = live
    ? null
    : (turn.messages.findLast((message) => message.role === 'assistant' && hasProse(message)) ??
      null)
  let workPlaced = workRow === null
  for (const message of turn.messages) {
    if (rendersAsMessage(message)) {
      rows.push({
        kind: 'message',
        key: message.id,
        message,
        isLatestReply: false,
        showReplyActions: message === finalReply
      })
    }
    // Directly under the prompt, so progress reads before the work does.
    if (plan !== null && message === turn.userMessage) {
      rows.push({
        kind: 'turn-plan',
        key: `plan:${turn.id}`,
        turnId: turn.id,
        plan,
        expanded: toggles.plans?.has(turn.id) === true
      })
    }
    // At the turn's first piece of work, after any prose that led into it.
    if (!workPlaced && messageHasWork(message)) {
      rows.push(workRow!)
      workPlaced = true
    }
  }
  if (!workPlaced) {
    rows.push(workRow!)
  }
  const changed = live ? null : deriveNativeChatTurnChangedFiles(work.activities)
  if (changed) {
    rows.push({
      kind: 'turn-changed-files',
      key: `changes:${turn.id}`,
      turnId: turn.id,
      changed,
      // XOR: the set records a user flip away from whichever default applies.
      expanded:
        shouldAutoExpandChangedFiles({ changed, isLatestTurn: context.isLastTurn }) !==
        (toggles.changedFiles?.has(turn.id) === true)
    })
  }
  if (context.isLastTurn && !live && input.lastError) {
    rows.push({
      kind: 'turn-error',
      key: `error:${turn.id}`,
      turnId: turn.id,
      message: input.lastError
    })
  }
}

export function buildNativeChatTimelineRows(input: {
  messages: readonly NativeChatMessage[]
  isWorking: boolean
  surface: NativeChatSurface
  t?: NativeChatTranslate
  cwd?: string | null
  toggles?: NativeChatTimelineToggles
  /** The last turn's failure, rendered inline at its end. */
  lastError?: string | null
}): NativeChatTimelineRow[] {
  const turns = groupNativeChatTurns(input.messages)
  const states = deriveNativeChatTurnStates({ turns, isWorking: input.isWorking })
  const rows: NativeChatTimelineRow[] = []
  turns.forEach((turn, index) => {
    const state = states.get(turn.id)
    pushTurnRows(
      rows,
      {
        turn,
        live: state?.settled !== true,
        durationMs: state?.durationMs ?? null,
        interrupted: state?.interrupted === true,
        isLastTurn: index === turns.length - 1
      },
      input
    )
  })
  const latest = rows.findLast(
    (row) => row.kind === 'message' && row.message.role === 'assistant' && row.showReplyActions
  )
  if (latest?.kind === 'message') {
    latest.isLatestReply = true
  }
  return rows
}
