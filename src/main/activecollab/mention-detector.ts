// Which @-mentions are NEW, as one pure function.
//
// Mentions cannot come from the assigned-task diff: the assigned-task page carries no mention data
// at all, so `acDiffTaskSnapshot` has nothing to compare. They exist only in the notifications
// stream (notifications.ts), which reports the CURRENTLY-PENDING updates per object — so a naive
// reading re-announces the same mention on every poll, forever. That is what this file prevents.
//
// Every rule here is a trap, and each is provable without a server or a clock:
//   - FIRST RUN EMITS NOTHING. `previous === null` seeds silently; anything else announces every
//     historical mention the moment the feature is switched on.
//   - A mention fires when its row's `lastUpdateOn` ADVANCES past what was last emitted for that
//     task. Same timestamp on the next poll is the same mention, not a second one.
//   - A row with NO timestamp is skipped and NOT recorded: there is nothing to compare it against,
//     so emitting it would re-fire it every poll and recording it would suppress a real later one.
//   - Entries are CARRIED FORWARD, never pruned to the current page. The stream only returns what
//     is still pending, so a mention that drops off the page would otherwise re-fire if it ever
//     came back. The map is bounded by recency instead.
//
// Banner-only by design: `acMergeTaskUnread` prunes unread against the assigned-task fetch, so a
// mention on a task NOT assigned to the user could never be cleared by reading it. The bell panel
// is the durable surface for mentions; this is the interruption.

import type { ActiveCollabObjectUpdate } from '../../shared/activecollab-types'

/** Per task id (as a string, which is what survives a JSON round trip), the last emitted stamp. */
export type AcMentionSeen = Record<string, number>

/**
 * Newest-first cap on the carried-forward map. The stream pages at 30, so this holds many polls of
 * history while keeping the file from growing without bound on a busy instance.
 */
export const AC_MENTION_SEEN_LIMIT = 500

function hasMention(update: ActiveCollabObjectUpdate): boolean {
  return update.kinds.some((entry) => entry.kind === 'mention')
}

/** Newest stamps win when the map is over the cap; ties keep whichever came first, which is stable. */
function bounded(seen: AcMentionSeen): AcMentionSeen {
  const keys = Object.keys(seen)
  if (keys.length <= AC_MENTION_SEEN_LIMIT) {
    return seen
  }
  const kept: AcMentionSeen = {}
  for (const key of keys
    .sort((a, b) => (seen[b] ?? 0) - (seen[a] ?? 0))
    .slice(0, AC_MENTION_SEEN_LIMIT)) {
    kept[key] = seen[key] as number
  }
  return kept
}

export function acDiffMentions(args: {
  /** Null on the very first run against a credential: seed, announce nothing. */
  previous: AcMentionSeen | null
  updates: readonly ActiveCollabObjectUpdate[]
}): { mentions: ActiveCollabObjectUpdate[]; seen: AcMentionSeen } {
  const { previous, updates } = args
  const seeding = previous === null
  const seen: AcMentionSeen = { ...previous }
  const mentions: ActiveCollabObjectUpdate[] = []

  for (const update of updates) {
    if (!hasMention(update) || update.lastUpdateOn === null) {
      continue
    }
    const key = String(update.taskId)
    const last = seen[key]
    if (last === undefined || update.lastUpdateOn > last) {
      seen[key] = update.lastUpdateOn
      if (!seeding) {
        mentions.push(update)
      }
    }
  }

  return { mentions, seen: bounded(seen) }
}
