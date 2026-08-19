// Aggregates a turn's file edits into the summary the timeline shows after the
// turn settles.
//
// Why it is needed: individual edits do render inline diffs, but the turn fold
// hides every non-final message of a settled turn, so once a turn completes
// there is no file signal left at all. For a Chat-mode user, "what did it
// actually change" is the question the transcript stops answering.
//
// Everything here reads from the tool-call blocks the renderer already holds —
// no git, no checkpoints, no main-process work.

import {
  changedLineCountsFromToolCall,
  type NativeChatChangedLineCounts
} from '../../../../shared/native-chat-diff'
import { toolFilePath } from '../../../../shared/native-chat-tool-summary'
import { isToolCallBlock, type NativeChatMessage } from '../../../../shared/native-chat-types'

export type NativeChatChangedFile = NativeChatChangedLineCounts & { path: string }

export type NativeChatTurnChangedFiles = {
  files: readonly NativeChatChangedFile[]
  totalAdditions: number
  totalDeletions: number
}

/** Above this, the card stays collapsed however recent the turn is. */
export const CHANGED_FILES_AUTO_EXPAND_MAX_FILES = 5
export const CHANGED_FILES_AUTO_EXPAND_MAX_LINES = 200
/** Collapsed rows show at most this many paths. */
export const CHANGED_FILES_PREVIEW_COUNT = 3

/** One entry per path, in first-touched order, with edits to the same file summed. */
export function deriveNativeChatTurnChangedFiles(
  messages: readonly NativeChatMessage[]
): NativeChatTurnChangedFiles | null {
  const byPath = new Map<string, NativeChatChangedFile>()
  for (const message of messages) {
    for (const block of message.blocks) {
      if (!isToolCallBlock(block)) {
        continue
      }
      const counts = changedLineCountsFromToolCall(block.name, block.input)
      if (counts === null) {
        continue
      }
      const path = toolFilePath(block.input)
      if (path === null) {
        continue
      }
      const existing = byPath.get(path)
      if (existing === undefined) {
        byPath.set(path, { path, ...counts })
        continue
      }
      // A turn commonly edits the same file several times; one row per file.
      existing.additions += counts.additions
      existing.deletions += counts.deletions
    }
  }
  if (byPath.size === 0) {
    return null
  }
  const files = [...byPath.values()]
  return {
    files,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0)
  }
}

/**
 * Open by default only for the turn the user just watched, and only when the
 * change is small enough to take in at a glance. A sprawling refactor expanded
 * by default would bury the agent's actual reply.
 */
export function shouldAutoExpandChangedFiles(args: {
  changed: NativeChatTurnChangedFiles
  isLatestTurn: boolean
}): boolean {
  if (!args.isLatestTurn) {
    return false
  }
  const totalLines = args.changed.totalAdditions + args.changed.totalDeletions
  return (
    args.changed.files.length <= CHANGED_FILES_AUTO_EXPAND_MAX_FILES &&
    totalLines <= CHANGED_FILES_AUTO_EXPAND_MAX_LINES
  )
}

/** Top-level directory, used to spread the preview across the tree. */
function topLevelScope(path: string): string {
  const normalized = path.replace(/^\.?\//, '')
  const cut = normalized.indexOf('/')
  return cut === -1 ? '' : normalized.slice(0, cut)
}

/**
 * The paths a collapsed card shows.
 *
 * Picks across distinct top-level scopes before doubling up inside one, so
 * "3 of 12 files" hints at the breadth of the change instead of showing three
 * neighbours from the same folder.
 */
export function selectChangedFilePreview(
  files: readonly NativeChatChangedFile[],
  limit = CHANGED_FILES_PREVIEW_COUNT
): readonly NativeChatChangedFile[] {
  if (files.length <= limit) {
    return files
  }
  const picked: NativeChatChangedFile[] = []
  const seenScopes = new Set<string>()
  for (const file of files) {
    const scope = topLevelScope(file.path)
    if (seenScopes.has(scope)) {
      continue
    }
    seenScopes.add(scope)
    picked.push(file)
    if (picked.length === limit) {
      return picked
    }
  }
  // Not enough distinct scopes; top up in order.
  for (const file of files) {
    if (picked.includes(file)) {
      continue
    }
    picked.push(file)
    if (picked.length === limit) {
      break
    }
  }
  return picked
}
