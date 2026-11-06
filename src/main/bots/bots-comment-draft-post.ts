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

export async function postBotsCommentDraft(
  client: BotsCommentDraftsClient,
  postComment: PostComment,
  { id, edit }: BotsCommentDraftPostArgs
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
  const posted = await postComment({ taskId: draft.taskId, bodyHtml: draft.bodyHtml })
  if (!posted.ok) {
    return { ok: false, reason: 'post-failed', failure: posted }
  }
  const marked = await client.setStatus(id, 'posted')
  if (!marked.ok) {
    return {
      ok: false,
      reason: 'posted-unmarked',
      message: `Posted to ActiveCollab, but the draft could not be cleared: ${
        'message' in marked ? marked.message : 'unknown error'
      }`
    }
  }
  return marked
}
