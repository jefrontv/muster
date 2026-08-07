import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'
import { translateSearchKeyword } from './settings-search-keywords'

export function getChatModeExperimentalSearchEntry(): SettingsSearchEntry {
  return {
    title: translate('auto.components.settings.experimental.search.chatMode.title', 'Chat mode'),
    description: translate(
      'auto.components.settings.experimental.search.chatMode.description',
      'A dedicated Chat surface with simple workspaces and chat threads, beside the Code view.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.0d24759f14',
        'experimental'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.chatMode.chat',
        'chat'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.chatMode.mode',
        'mode'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.chatMode.workspace',
        'workspace'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.chatMode.thread',
        'thread'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.experimental.search.chatMode.cowork',
        'cowork'
      )
    ]
  }
}
