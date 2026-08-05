// Settings-search entries for the Agent Capabilities pane, mirroring the other per-pane
// search modules so Cmd+J and the Settings sidebar index the same surface.

import type { SettingsSearchEntry } from './settings-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

const sharedKeywords = (): string[] => [
  ...translateSearchKeyword('auto.components.settings.agentCapabilities.search.agent', 'agent'),
  ...translateSearchKeyword(
    'auto.components.settings.agentCapabilities.search.capability',
    'capability'
  ),
  ...translateSearchKeyword('auto.components.settings.agentCapabilities.search.tools', 'tools'),
  ...translateSearchKeyword(
    'auto.components.settings.agentCapabilities.search.permissions',
    'permissions'
  )
]

export const getAgentCapabilitiesPaneSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: translate(
        'auto.components.settings.agentCapabilities.search.paneTitle',
        'Agent Capabilities'
      ),
      description: translate(
        'auto.components.settings.agentCapabilities.search.paneDescription',
        'Choose which built-in tools and skills Muster hands to your agents.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.harness',
          'harness'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.optIn',
          'opt in'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.agentCapabilities.search.sitesMcpTitle',
        'Site tools (muster-sites MCP)'
      ),
      description: translate(
        'auto.components.settings.agentCapabilities.search.sitesMcpDescription',
        'Expose the built-in site MCP server so agents can run deploys, imports, and database queries.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.agentCapabilities.search.mcp', 'mcp', {
          englishOnly: true
        }),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.musterSites',
          'muster-sites',
          { englishOnly: true }
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.sites',
          'sites'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.wordpress',
          'wordpress',
          { englishOnly: true }
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.deploy',
          'deploy'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.database',
          'database'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.agentCapabilities.search.sitesMcpInstallTitle',
        'muster-sites MCP install'
      ),
      description: translate(
        'auto.components.settings.agentCapabilities.search.sitesMcpInstallDescription',
        'Register the built-in site MCP server with Claude Code, Codex, and Cursor global configs.'
      ),
      keywords: [
        ...sharedKeywords(),
        ...translateSearchKeyword('auto.components.settings.agentCapabilities.search.mcp', 'mcp', {
          englishOnly: true
        }),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.musterSites',
          'muster-sites',
          { englishOnly: true }
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.install',
          'install'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.claudeCode',
          'claude code',
          { englishOnly: true }
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.codex',
          'codex',
          { englishOnly: true }
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agentCapabilities.search.cursor',
          'cursor',
          { englishOnly: true }
        )
      ]
    }
    // Bundled-skills entry removed with its Settings section: a search hit that navigates to a
    // section that no longer renders is worse than no hit.
  ]
)
