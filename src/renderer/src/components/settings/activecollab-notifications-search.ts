// Settings-search entries for the ActiveCollab notification toggles. Kept beside
// notifications-search.ts so neither file carries the other's budget.

import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

type NotificationSearchEntry = {
  title: string
  description: string
  keywords: string[]
}

// ActiveCollab is a product name, so the English spellings stay searchable in every locale.
function sharedKeywords(): string[] {
  return [
    ...translateSearchKeyword(
      'auto.components.settings.notifications.search.ca8faa40d7',
      'notifications'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.notifications.search.activeCollabKeyword',
      'activecollab',
      { aliases: ['active collab', 'collab'], englishOnly: true }
    ),
    ...translateSearchKeyword('auto.components.settings.notifications.search.193e1f107c', 'task')
  ]
}

export function activeCollabNotificationSearchEntries(): NotificationSearchEntry[] {
  return [
    {
      title: translate(
        'auto.components.settings.notifications.search.activeCollabAssigned',
        'Task Assigned To You'
      ),
      description: translate(
        'auto.components.settings.notifications.search.activeCollabAssignedDescription',
        'Notify when a task you were not assigned before shows up on your ActiveCollab list.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabAssignedKeyword',
          'assigned'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.notifications.search.activeCollabComments',
        'New Comments'
      ),
      description: translate(
        'auto.components.settings.notifications.search.activeCollabCommentsDescription',
        'Notify when someone comments on an ActiveCollab task assigned to you.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabCommentsKeyword',
          'comments'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabRepliesKeyword',
          'replies'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.notifications.search.activeCollabDue',
        'Due Date Getting Closer'
      ),
      description: translate(
        'auto.components.settings.notifications.search.activeCollabDueDescription',
        'Notify when an assigned ActiveCollab task moves into a nearer due window, up to overdue.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabDueKeyword',
          'due date'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabOverdueKeyword',
          'overdue'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabDeadlineKeyword',
          'deadline'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.notifications.search.activeCollabUpdated',
        'Task Details Edited'
      ),
      description: translate(
        'auto.components.settings.notifications.search.activeCollabUpdatedDescription',
        'Notify when an assigned ActiveCollab task is edited without a new comment.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabUpdatedKeyword',
          'updated'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabEditedKeyword',
          'edited'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.notifications.search.activeCollabMention',
        'Mentioned You'
      ),
      description: translate(
        'auto.components.settings.notifications.search.activeCollabMentionDescription',
        'Notify when somebody @-mentions you on any ActiveCollab task you can see.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabMentionKeyword',
          'mention'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabAtKeyword',
          'at'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.notifications.search.activeCollabSound',
        'ActiveCollab Sound'
      ),
      description: translate(
        'auto.components.settings.notifications.search.activeCollabSoundDescription',
        'Give ActiveCollab alerts their own sound, or let them use the global notification sound.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabSoundKeyword',
          'sound',
          { aliases: ['audio', 'alert', 'chime'] }
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.notifications.search.activeCollabStyle',
        'Banner Wording'
      ),
      description: translate(
        'auto.components.settings.notifications.search.activeCollabStyleDescription',
        'Choose whether ActiveCollab banners lead with the change and name the project, or lead with the task name.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.notifications.search.activeCollabStyleKeyword',
          'style',
          { aliases: ['wording', 'format', 'banner'] }
        )
      ]
    }
  ]
}
