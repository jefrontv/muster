// Whose comment it was, which the assigned-task page cannot say.
//
// Comment notifications are a count delta (see task-change-detector.ts) and the task row carries
// no author, so a comment the user posted anywhere other than this app — the ActiveCollab web UI,
// the mobile app, the MCP server, a second Muster install — reads exactly like somebody else's and
// is announced back to them. The only author-bearing source is the task's own comment list, so a
// delta is confirmed against it before the banner goes out.
//
// Rules, each one a trap:
//   - A FAILED read notifies as before. Swallowing a banner because a request fell over would
//     hide real comments, which is worse than the duplicate this exists to remove.
//   - Only the newest `newComments` comments are judged. Older ones were reported long ago.
//   - A comment with NO author is somebody else's. Unknown must not mean "yours".
//   - Above the cap the check is skipped wholesale. Forty tasks changing at once is a bulk event,
//     and forty extra requests to shave a banner off it is the wrong trade.

import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabComment, ActiveCollabTask } from '../../shared/activecollab-types'
import type { AcTaskChange } from './task-change-detector'

/** Comment deltas in one poll above which authorship goes unchecked. */
export const AC_SELF_COMMENT_CHECK_CAP = 5

export type AcTaskCommentsFetch = (
  task: ActiveCollabTask
) => Promise<ActiveCollabResult<readonly ActiveCollabComment[]>>

/** Newest first, so "the last n comments" is the head of the list. */
function newestFirst(comments: readonly ActiveCollabComment[]): ActiveCollabComment[] {
  return [...comments].sort((a, b) => (b.createdOn ?? 0) - (a.createdOn ?? 0))
}

/**
 * How many of the newest `newComments` were written by somebody other than `selfUserId`.
 * Returns `newComments` unchanged when the read failed or the thread is shorter than the delta:
 * a thread that cannot account for the delta has not proved the comments are the user's.
 */
function foreignCommentCount(
  comments: readonly ActiveCollabComment[],
  newComments: number,
  selfUserId: number
): number {
  const recent = newestFirst(comments).slice(0, newComments)
  if (recent.length < newComments) {
    return newComments
  }
  return recent.filter((comment) => comment.createdById !== selfUserId).length
}

/**
 * Drops comment changes the user authored and reduces mixed ones. Every other kind passes
 * through untouched and in order.
 */
export async function acDropSelfAuthoredComments(args: {
  changes: readonly AcTaskChange[]
  /** Null when the connected identity is unknown; nothing can be attributed, so nothing is dropped. */
  selfUserId: number | null
  fetchTaskComments: AcTaskCommentsFetch
}): Promise<AcTaskChange[]> {
  const { changes, selfUserId, fetchTaskComments } = args
  const commentChanges = changes.filter((change) => change.kind === 'comments')
  if (selfUserId === null || commentChanges.length === 0) {
    return [...changes]
  }
  if (commentChanges.length > AC_SELF_COMMENT_CHECK_CAP) {
    return [...changes]
  }

  const remaining = new Map<number, number>()
  await Promise.all(
    commentChanges.map(async (change) => {
      let result: ActiveCollabResult<readonly ActiveCollabComment[]>
      try {
        result = await fetchTaskComments(change.task)
      } catch {
        return
      }
      if (result.ok) {
        remaining.set(
          change.task.id,
          foreignCommentCount(result.value, change.newComments, selfUserId)
        )
      }
    })
  )

  const kept: AcTaskChange[] = []
  for (const change of changes) {
    if (change.kind !== 'comments') {
      kept.push(change)
      continue
    }
    const newComments = remaining.get(change.task.id) ?? change.newComments
    if (newComments > 0) {
      kept.push({ ...change, newComments })
    }
  }
  return kept
}
