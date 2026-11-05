// Which turns can be undone, and what the CLI's rewind_files answer says it would change.

import type { ChatEngineItem, ChatEngineTurn } from '../../../../shared/chat-engine-types'

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

function itemsEditFiles(items: readonly ChatEngineItem[]): boolean {
  return items.some((item) =>
    item.kind === 'tool'
      ? EDIT_TOOLS.has(item.name) && item.status === 'done'
      : item.kind === 'agent' && itemsEditFiles(item.items)
  )
}

/** A settled turn that changed files and has the CLI uuid the rewind needs. */
export function turnUndoTarget(turn: Pick<ChatEngineTurn, 'status' | 'user' | 'items'>): {
  userMessageId: string | null
} | null {
  if (turn.status === 'running' || !itemsEditFiles(turn.items)) {
    return null
  }
  return { userMessageId: turn.user?.uuid ?? null }
}

export type ChatRewindPreview = {
  canRewind: boolean
  files: string[]
  error: string | null
}

/** Reads the SDK's RewindFilesResult defensively; the CLI owns its shape. */
export function parseRewindPreview(value: unknown): ChatRewindPreview {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const files = Array.isArray(record.filesChanged)
    ? record.filesChanged.filter((file): file is string => typeof file === 'string')
    : []
  return {
    canRewind: record.canRewind !== false,
    files,
    error: typeof record.error === 'string' && record.error !== '' ? record.error : null
  }
}
