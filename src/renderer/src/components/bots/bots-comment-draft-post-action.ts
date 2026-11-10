// Posting a draft, optionally handing the task back; a failed reassign after a good post is a toast with Retry.
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  BotsCommentDraft,
  BotsCommentDraftPostArgs,
  BotsCommentDraftResult,
  BotsCommentDraftTask
} from '../../../../shared/bots-comment-draft-types'

export type HandBackTo = NonNullable<BotsCommentDraftTask['handBackTo']>

function retryReassign(draft: BotsCommentDraft, to: HandBackTo): void {
  void window.api.bots
    .reassignCommentDraftTask({
      projectId: draft.projectId,
      taskId: draft.taskId,
      assigneeId: to.userId
    })
    .then((result) => {
      if (result.ok) {
        toast.success(reassignedText(to))
      } else {
        reassignFailed(draft, to, result.reason === 'error' ? result.message : result.reason)
      }
    })
}

function reassignedText(to: HandBackTo): string {
  return translate(
    'auto.components.bots.commentDrafts.reassigned',
    'Posted and reassigned to {{value0}}',
    {
      value0: to.name
    }
  )
}

function reassignFailed(draft: BotsCommentDraft, to: HandBackTo, message: string): void {
  toast.error(
    translate(
      'auto.components.bots.commentDrafts.reassignFailed',
      "Posted, but couldn't reassign to {{value0}}",
      {
        value0: to.name
      }
    ),
    {
      description: message,
      action: {
        label: translate('auto.components.bots.commentDrafts.retryReassign', 'Retry'),
        onClick: () => retryReassign(draft, to)
      }
    }
  )
}

/** A reassign that fails after the comment posted counts as success here; the toast carries the retry. */
export async function postCommentDraft(
  draft: BotsCommentDraft,
  args: BotsCommentDraftPostArgs,
  handBackTo?: HandBackTo
): Promise<BotsCommentDraftResult<BotsCommentDraft>> {
  const result = await window.api.bots.postCommentDraft(
    handBackTo ? { ...args, reassignTo: handBackTo.userId } : args
  )
  if (!handBackTo) {
    return result
  }
  if (result.ok) {
    toast.success(reassignedText(handBackTo))
    return result
  }
  if (result.reason === 'reassign-failed') {
    reassignFailed(draft, handBackTo, result.message)
    return { ok: true, value: result.draft }
  }
  return result
}
