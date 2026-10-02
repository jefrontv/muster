// Aggregates a turn's file edits into the summary the timeline shows after the
// turn settles.
//
// Why it is needed: individual edits do render inline diffs, but the turn fold
// hides every non-final message of a settled turn, so once a turn completes
// there is no file signal left at all. For a Chat-mode user, "what did it
// actually change" is the question the transcript stops answering.
//
// Everything here reads from the work log's activities — no git, no
// checkpoints, no main-process work.

import type { NativeChatToolActivity } from '../../../../shared/native-chat-tool-activity-types'

export type NativeChatChangedFile = { path: string; additions: number; deletions: number }

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

/** One entry per path, first-touched order, from the work log's own edit
 *  activities; counts are the structured patch's, failed edits changed nothing. */
export function deriveNativeChatTurnChangedFiles(
  activities: readonly NativeChatToolActivity[]
): NativeChatTurnChangedFiles | null {
  const byPath = new Map<string, NativeChatChangedFile>()
  for (const activity of activities) {
    if (activity.group !== 'edit' || activity.failed || activity.path === null) {
      continue
    }
    const existing = byPath.get(activity.path) ?? {
      path: activity.path,
      additions: 0,
      deletions: 0
    }
    existing.additions += activity.additions ?? 0
    existing.deletions += activity.deletions ?? 0
    byPath.set(activity.path, existing)
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
