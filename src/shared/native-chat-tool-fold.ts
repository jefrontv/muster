import {
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatBlock,
  type NativeChatMessage,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from './native-chat-types'

function isToolOnlyMessage(message: NativeChatMessage): boolean {
  return (
    message.blocks.length > 0 &&
    message.blocks.every((block) => isToolCallBlock(block) || isToolResultBlock(block))
  )
}

/** Fold consecutive tool-only messages into their preceding assistant turn. */
export function foldToolMessages(messages: readonly NativeChatMessage[]): NativeChatMessage[] {
  const output: NativeChatMessage[] = []
  let mutableAssistantIndex = -1
  for (const message of messages) {
    const previous = output.at(-1)
    if (isToolOnlyMessage(message) && previous?.role === 'assistant') {
      const index = output.length - 1
      if (mutableAssistantIndex !== index) {
        output[index] = { ...previous, blocks: [...previous.blocks] }
        mutableAssistantIndex = index
      }
      output[index]!.blocks.push(...message.blocks)
    } else {
      output.push(message)
      mutableAssistantIndex = -1
    }
  }
  return output
}

export type NativeChatToolPair = {
  call?: NativeChatToolCallBlock
  result?: NativeChatToolResultBlock
}

/** Pair calls and results by tool_use id, falling back to FIFO order for blocks
 *  without ids (older transcripts, other agents). */
export function pairToolBlocks(
  blocks: readonly NativeChatBlock[],
  limit = Infinity
): NativeChatToolPair[] {
  const pairs: NativeChatToolPair[] = []
  // One queue entry per call, in call order; `slot` is null past the limit.
  const queue: { slot: number | null; answered: boolean; id?: string }[] = []
  const byId = new Map<string, (typeof queue)[number]>()
  for (const block of blocks) {
    if (block.type === 'tool-call') {
      const slot = pairs.length < limit ? pairs.push({ call: block }) - 1 : null
      const entry = { slot, answered: false, ...(block.id ? { id: block.id } : {}) }
      queue.push(entry)
      if (block.id) {
        byId.set(block.id, entry)
      }
      continue
    }
    if (block.type !== 'tool-result') {
      continue
    }
    const byIdEntry = block.toolUseId ? byId.get(block.toolUseId) : undefined
    const entry =
      byIdEntry && !byIdEntry.answered
        ? byIdEntry
        : queue.find((candidate) => !candidate.answered && (!block.toolUseId || !candidate.id))
    if (!entry) {
      if (pairs.length < limit) {
        pairs.push({ result: block })
      }
      continue
    }
    entry.answered = true
    if (entry.slot !== null) {
      pairs[entry.slot]!.result = block
    }
  }
  return pairs
}

export function splitNativeChatBlocks(blocks: readonly NativeChatBlock[]): {
  prose: NativeChatBlock[]
  tools: NativeChatBlock[]
} {
  const prose: NativeChatBlock[] = []
  const tools: NativeChatBlock[] = []
  for (const block of blocks) {
    if (isToolCallBlock(block) || isToolResultBlock(block)) {
      tools.push(block)
    } else {
      prose.push(block)
    }
  }
  return { prose, tools }
}

const PLAN_TOOL_NAMES = new Set(['TodoWrite'])

/** Drops TodoWrite calls and their results; the plan checklist already shows them. */
export function withoutPlanTools(blocks: readonly NativeChatBlock[]): NativeChatBlock[] {
  const hidden = new Set<NativeChatBlock>()
  for (const pair of pairToolBlocks(blocks)) {
    if (pair.call && PLAN_TOOL_NAMES.has(pair.call.name)) {
      hidden.add(pair.call)
      if (pair.result) {
        hidden.add(pair.result)
      }
    }
  }
  return hidden.size === 0 ? [...blocks] : blocks.filter((block) => !hidden.has(block))
}
