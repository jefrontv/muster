// Immutable edits to a turn's item tree. Every edit returns new objects along the
// changed path only, so the renderer can memoize untouched items by reference.

import type { ChatEngineItem, ChatEngineTurn } from '../../../shared/chat-engine-types'

export function findItem(items: readonly ChatEngineItem[], id: string): ChatEngineItem | null {
  for (const item of items) {
    if (item.id === id) {
      return item
    }
    if (item.kind === 'agent') {
      const nested = findItem(item.items, id)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

function mapItems(
  items: readonly ChatEngineItem[],
  id: string,
  update: (item: ChatEngineItem) => ChatEngineItem
): { items: ChatEngineItem[]; changed: boolean } {
  let changed = false
  const next = items.map((item) => {
    if (changed) {
      return item
    }
    if (item.id === id) {
      const updated = update(item)
      changed = updated !== item
      return updated
    }
    if (item.kind === 'agent') {
      const nested = mapItems(item.items, id, update)
      if (nested.changed) {
        changed = true
        return { ...item, items: nested.items }
      }
    }
    return item
  })
  return { items: changed ? next : (items as ChatEngineItem[]), changed }
}

/** Replace one item anywhere in the turn; returns the same turn when nothing changed. */
export function updateItem(
  turn: ChatEngineTurn,
  id: string,
  update: (item: ChatEngineItem) => ChatEngineItem
): ChatEngineTurn {
  const result = mapItems(turn.items, id, update)
  return result.changed ? { ...turn, items: result.items } : turn
}

/** Append at the top level, or inside the agent block that owns `parentId`. */
export function appendItem(
  turn: ChatEngineTurn,
  item: ChatEngineItem,
  parentId: string | null
): ChatEngineTurn {
  if (parentId) {
    const parent = findItem(turn.items, parentId)
    if (parent?.kind === 'agent') {
      return updateItem(turn, parentId, (current) =>
        current.kind === 'agent' ? { ...current, items: [...current.items, item] } : current
      )
    }
  }
  return { ...turn, items: [...turn.items, item] }
}

/** Settle every still-streaming or running item, e.g. when a turn ends or the process dies. */
export function settleItems(
  items: readonly ChatEngineItem[],
  toolStatus: 'done' | 'interrupted'
): ChatEngineItem[] {
  return items.map((item) => {
    switch (item.kind) {
      case 'text':
      case 'thinking':
        return item.streaming ? { ...item, streaming: false } : item
      case 'tool':
        return item.status === 'streaming' ||
          item.status === 'running' ||
          item.status === 'awaiting-approval'
          ? { ...item, status: toolStatus === 'done' ? 'done' : 'interrupted' }
          : item
      case 'agent': {
        const nested = settleItems(item.items, toolStatus)
        const status =
          item.status === 'running' ? (toolStatus === 'done' ? 'done' : 'stopped') : item.status
        return { ...item, status, items: nested }
      }
      case 'notice':
      case 'steer':
        return item
    }
  })
}
