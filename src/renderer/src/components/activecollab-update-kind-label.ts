// What an ActiveCollab update row says actually CHANGED.
//
// The stream already tells us this per object (`ActiveCollabObjectUpdate.kinds`), and until now the
// bell fetched it and threw it away — every row read "something happened here". A mention is the
// highest-signal thing ActiveCollab can tell you and it was indistinguishable from a stray edit.
//
// Counts are interpolated, not pluralised by the i18n layer: `translate()` here is plain
// interpolation, so singular and plural are separate strings rather than one key with a rule.

import { translate } from '@/i18n/i18n'
import type { ActiveCollabUpdateKind } from '../../../shared/activecollab-types'

/**
 * A phrase for one update kind, or null when there is nothing honest to say. `other` is the codec's
 * bucket for an update key this build does not recognise, so it deliberately has NO phrase: naming
 * it would be inventing a change we cannot describe.
 */
export function activeCollabUpdateKindLabel(
  kind: ActiveCollabUpdateKind,
  count: number
): string | null {
  switch (kind) {
    case 'mention':
      return translate('auto.components.activecollab.my_work.update_mention', 'mentioned you')
    case 'comment':
      return count === 1
        ? translate('auto.components.activecollab.my_work.update_comment_one', '1 new comment')
        : translate(
            'auto.components.activecollab.my_work.update_comment_many',
            '{{value0}} new comments',
            { value0: count }
          )
    case 'created':
      return translate('auto.components.activecollab.my_work.update_created', 'new task')
    case 'reassigned':
      // Not "reassigned to you": the stream says the assignee moved, never who it moved to.
      return translate('auto.components.activecollab.my_work.update_reassigned', 'reassigned')
    case 'other':
      return null
  }
}
