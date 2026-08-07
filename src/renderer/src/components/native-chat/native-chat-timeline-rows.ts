// Flattens the ordered message array into the rows the timeline renders:
// message rows, settled-turn fold rows, and the running turn's live tool-call
// collapse toggle (T3 MAX_VISIBLE_WORK_LOG_ENTRIES = 1). Pure derivation; the
// list owns the expand state.

import {
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatMessage
} from '../../../../shared/native-chat-types'
import {
  deriveNativeChatTurnFolds,
  groupNativeChatTurns,
  type NativeChatTurn
} from './native-chat-turn-folds'

/** Within the running turn, only the most recent tool-run row stays visible. */
export const NATIVE_CHAT_MAX_VISIBLE_LIVE_TOOL_RUNS = 1

export type NativeChatTimelineRow =
  | {
      kind: 'message'
      message: NativeChatMessage
      /** True hides this row's tool run (its prose still renders) — the live
       *  tool-call collapse within the running turn. */
      suppressTools: boolean
    }
  | {
      kind: 'turn-fold'
      turnId: string
      durationMs: number | null
      interrupted: boolean
      expanded: boolean
    }
  | { kind: 'live-tool-toggle'; turnId: string; hiddenCount: number; expanded: boolean }

function hasToolBlocks(message: NativeChatMessage): boolean {
  return message.blocks.some((block) => isToolCallBlock(block) || isToolResultBlock(block))
}

export type NativeChatLiveToolCollapse = {
  /** Earlier tool-run rows whose tool activity hides while collapsed. */
  hiddenToolMessageIds: ReadonlySet<string>
  /** The row the toggle sits above (the most recent tool-run row). */
  latestToolMessageId: string
  hiddenCount: number
}

/** Collapse plan for a running turn's tool-run rows; null when one or fewer. */
export function deriveNativeChatLiveToolCollapse(
  turnMessages: readonly NativeChatMessage[]
): NativeChatLiveToolCollapse | null {
  const toolMessages = turnMessages.filter(hasToolBlocks)
  if (toolMessages.length <= NATIVE_CHAT_MAX_VISIBLE_LIVE_TOOL_RUNS) {
    return null
  }
  const hidden = toolMessages.slice(0, -NATIVE_CHAT_MAX_VISIBLE_LIVE_TOOL_RUNS)
  return {
    hiddenToolMessageIds: new Set(hidden.map((message) => message.id)),
    latestToolMessageId: toolMessages.at(-1)!.id,
    hiddenCount: hidden.length
  }
}

function pushRunningTurnRows(
  rows: NativeChatTimelineRow[],
  turn: NativeChatTurn,
  expanded: boolean
): void {
  const collapse = deriveNativeChatLiveToolCollapse(turn.messages)
  for (const message of turn.messages) {
    if (collapse && message.id === collapse.latestToolMessageId) {
      rows.push({
        kind: 'live-tool-toggle',
        turnId: turn.id,
        hiddenCount: collapse.hiddenCount,
        expanded
      })
    }
    rows.push({
      kind: 'message',
      message,
      suppressTools: !expanded && collapse !== null && collapse.hiddenToolMessageIds.has(message.id)
    })
  }
}

export function buildNativeChatTimelineRows(input: {
  messages: readonly NativeChatMessage[]
  isWorking: boolean
  /** Settled turns the user re-opened (fold expanded in place). */
  expandedTurnIds: ReadonlySet<string>
  /** Running turns whose earlier tool runs the user revealed. */
  expandedLiveToolTurnIds: ReadonlySet<string>
}): NativeChatTimelineRow[] {
  const turns = groupNativeChatTurns(input.messages)
  const folds = deriveNativeChatTurnFolds({ messages: input.messages, isWorking: input.isWorking })

  const rows: NativeChatTimelineRow[] = []
  for (const turn of turns) {
    const fold = folds.get(turn.id)
    if (!fold) {
      pushRunningTurnRows(rows, turn, input.expandedLiveToolTurnIds.has(turn.id))
      continue
    }
    const expanded = input.expandedTurnIds.has(turn.id)
    for (const message of turn.messages) {
      if (fold.droppedMessageIds.has(message.id)) {
        continue
      }
      if (!expanded && fold.hiddenMessageIds.has(message.id)) {
        continue
      }
      rows.push({ kind: 'message', message, suppressTools: false })
      // The fold row anchors right under the turn's user message.
      if (message === turn.userMessage) {
        rows.push({
          kind: 'turn-fold',
          turnId: turn.id,
          durationMs: fold.durationMs,
          interrupted: fold.interrupted,
          expanded
        })
      }
    }
  }
  return rows
}
