// Posting a draft: ActiveCollab first, and the draft is marked posted only once ActiveCollab confirms.
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type {
  BotsCommentDraft,
  BotsCommentDraftPostArgs,
  BotsCommentDraftResult
} from '../../shared/bots-comment-draft-types'
import type { BotsCommentDraftsClient } from './bots-comment-drafts-client'

export type PostComment = (args: {
  taskId: number
  bodyHtml: string
}) => Promise<ActiveCollabResult<unknown>>

export type ReassignTask = (args: {
  projectId: number
  taskId: number
  assigneeId: number
}) => Promise<ActiveCollabResult<unknown>>

// Draft id -> version ActiveCollab already has; a retry after "posted-unmarked" only clears the draft.
const postedNotCleared = new Map<string, number>()

export async function postBotsCommentDraft(
  client: BotsCommentDraftsClient,
  postComment: PostComment,
  { id, edit, reassignTo }: BotsCommentDraftPostArgs,
  alreadyPosted: Map<string, number> = postedNotCleared,
  reassign?: ReassignTask
): Promise<BotsCommentDraftResult<BotsCommentDraft>> {
  let draft: BotsCommentDraft
  if (edit) {
    // Saving first means a 409 stops the post, so a bot's newer text is never posted over unseen.
    const saved = await client.update({ id, ...edit })
    if (!saved.ok) {
      return saved
    }
    draft = saved.value
  } else {
    const listed = await client.list('waiting')
    if (!listed.ok) {
      return listed
    }
    const found = listed.value.find((entry) => entry.id === id)
    if (!found) {
      return { ok: false, reason: 'gone', message: 'This draft was already posted or discarded.' }
    }
    draft = found
  }
  if (alreadyPosted.get(id) !== draft.version) {
    const posted = await postComment({ taskId: draft.taskId, bodyHtml: draft.bodyHtml })
    if (!posted.ok) {
      return { ok: false, reason: 'post-failed', failure: posted }
    }
    alreadyPosted.set(id, draft.version)
  }
  const marked = await client.setStatus(id, 'posted')
  if (marked.ok) {
    alreadyPosted.delete(id)
  } else {
    return {
      ok: false,
      reason: 'posted-unmarked',
      message: `Posted to ActiveCollab, but the draft could not be cleared: ${
        'message' in marked ? marked.message : 'unknown error'
      }`
    }
  }
  if (reassignTo === undefined || !reassign) {
    return marked
  }
  // The comment is already in; a failed reassign is reported, never retried by posting again.
  const moved = await reassign({
    projectId: draft.projectId,
    taskId: draft.taskId,
    assigneeId: reassignTo
  })
  if (!moved.ok) {
    return {
      ok: false,
      reason: 'reassign-failed',
      message: `Posted, but couldn't reassign: ${moved.error}`,
      draft: marked.value
    }
  }
  return marked
}
