// Card copy for a failed draft action; a conflict is shown as its own banner, not as an error.
import { translate } from '@/i18n/i18n'
import type { BotsCommentDraftFailure } from '../../../../shared/bots-comment-draft-types'
import { describeActiveCollabFailure } from '../activecollab-failure-message'

export function describeBotsCommentDraftFailure(failure: BotsCommentDraftFailure): string {
  switch (failure.reason) {
    case 'post-failed':
      return translate('auto.components.bots.commentDrafts.postFailed', 'Not posted. {{value0}}', {
        value0: describeActiveCollabFailure(failure.failure)
      })
    case 'posted-unmarked':
      return translate(
        'auto.components.bots.commentDrafts.postedUnmarked',
        'Posted to ActiveCollab, but this draft could not be cleared. Discard it so it is not posted twice.'
      )
    case 'gone':
      return translate(
        'auto.components.bots.commentDrafts.gone',
        'This draft was already posted or discarded.'
      )
    case 'unavailable':
      return translate(
        'auto.components.bots.commentDrafts.unavailable',
        'Muster Bots is not running.'
      )
    case 'conflict':
      return translate('auto.components.bots.commentDrafts.conflict', 'The bot changed this draft.')
    case 'error':
      return translate(
        'auto.components.bots.commentDrafts.error',
        'Could not reach Muster Bots: {{value0}}',
        { value0: failure.message }
      )
  }
}
