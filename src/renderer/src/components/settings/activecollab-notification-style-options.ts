import type { ActiveCollabNotificationStyle } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export type ActiveCollabNotificationStyleOption = {
  id: ActiveCollabNotificationStyle
  title: string
  /** A real banner in this style, so the choice is legible before it fires at 4pm. */
  example: string
}

export const getActiveCollabNotificationStyleOptions = createLocalizedCatalog(
  (): ActiveCollabNotificationStyleOption[] => [
    {
      id: 'detailed',
      title: translate(
        'auto.components.settings.activeCollabNotificationStyle.detailed',
        'Detailed'
      ),
      example: translate(
        'auto.components.settings.activeCollabNotificationStyle.detailedExample',
        '2 new comments: Fix the header — Website Redesign'
      )
    },
    {
      id: 'minimal',
      title: translate('auto.components.settings.activeCollabNotificationStyle.minimal', 'Minimal'),
      example: translate(
        'auto.components.settings.activeCollabNotificationStyle.minimalExample',
        'Fix the header — 2 new comments'
      )
    }
  ]
)
