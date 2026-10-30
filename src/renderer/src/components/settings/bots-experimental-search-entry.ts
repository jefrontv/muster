import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'
import { translateSearchKeyword } from './settings-search-keywords'

export function getBotsExperimentalSearchEntry(): SettingsSearchEntry {
  return {
    title: translate('auto.components.settings.experimental.search.bots.title', 'Muster Bots'),
    description: translate(
      'auto.components.settings.experimental.search.bots.description',
      'A Bots tab beside Chat and Code: AI bots with their own instructions, schedules and connected apps.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.0d24759f14',
        'experimental'
      ),
      ...translateSearchKeyword('auto.components.settings.experimental.search.bots.bots', 'bots'),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.bots.assistant',
        'assistant'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.bots.automation',
        'automation'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.bots.composio',
        'composio'
      )
    ]
  }
}
