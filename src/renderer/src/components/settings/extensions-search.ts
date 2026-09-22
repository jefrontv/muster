// Settings-search entries for the Extensions pane, mirroring the other per-pane search modules so
// Cmd+J and the Settings sidebar index the same surface.

import type { SettingsSearchEntry } from './settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

const sharedKeywords = (): string[] => [
  ...translateSearchKeyword('auto.components.settings.extensions.search.extension', 'extension'),
  ...translateSearchKeyword('auto.components.settings.extensions.search.install', 'install'),
  ...translateSearchKeyword('auto.components.settings.extensions.search.update', 'update'),
  ...translateSearchKeyword('auto.components.settings.extensions.search.mcp', 'mcp', {
    englishOnly: true
  })
]

export const getExtensionsPaneSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: translate('auto.components.settings.extensions.search.paneTitle', 'Extensions'),
      description: translate(
        'auto.components.settings.extensions.search.paneDescription',
        'Install and update the skills, MCP servers and tools your coding agents use.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.extensions.search.skills', 'skills'),
        ...translateSearchKeyword('auto.components.settings.extensions.search.tools', 'tools'),
        ...translateSearchKeyword('auto.components.settings.extensions.search.hub', 'hub'),
        ...translateSearchKeyword(
          'auto.components.settings.extensions.search.marketplace',
          'marketplace'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.extensions.search.autoUpdateTitle',
        'Automatic extension updates'
      ),
      description: translate(
        'auto.components.settings.extensions.search.autoUpdateDescription',
        'Let Muster apply updates for eligible extensions at launch instead of prompting each time.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.extensions.search.auto', 'automatic'),
        ...translateSearchKeyword('auto.components.settings.extensions.search.upgrade', 'upgrade')
      ]
    },
    {
      title: translate(
        'auto.components.settings.extensions.search.activecollabTitle',
        'ActiveCollab MCP'
      ),
      description: translate(
        'auto.components.settings.extensions.search.activecollabDescription',
        'Install or update the ActiveCollab MCP server and register it with your harnesses.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.extensions.search.activecollab',
          'activecollab',
          { englishOnly: true }
        ),
        ...translateSearchKeyword('auto.components.settings.extensions.search.tasks', 'tasks')
      ]
    },
    {
      title: translate('auto.components.settings.extensions.search.acfTitle', 'ACF JSON MCP'),
      description: translate(
        'auto.components.settings.extensions.search.acfDescription',
        'Install or update the ACF field-group MCP server for WordPress projects.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.extensions.search.acf', 'acf', {
          englishOnly: true
        }),
        ...translateSearchKeyword(
          'auto.components.settings.extensions.search.wordpress',
          'wordpress',
          { englishOnly: true }
        )
      ]
    },
    {
      title: translate('auto.components.settings.extensions.search.context7Title', 'Context7'),
      description: translate(
        'auto.components.settings.extensions.search.context7Description',
        'Install or update the Context7 MCP server so your agents can read current library docs.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.extensions.search.context7',
          'context7',
          { englishOnly: true }
        ),
        ...translateSearchKeyword('auto.components.settings.extensions.search.docs', 'docs')
      ]
    },
    {
      title: translate('auto.components.settings.extensions.search.agentLocalTitle', 'Agent Local'),
      description: translate(
        'auto.components.settings.extensions.search.agentLocalDescription',
        'Check the installed Agent Local version and update it to the latest release.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.extensions.search.agentLocal',
          'agent local',
          { englishOnly: true }
        ),
        ...translateSearchKeyword('auto.components.settings.extensions.search.local', 'local')
      ]
    }
  ]
)
