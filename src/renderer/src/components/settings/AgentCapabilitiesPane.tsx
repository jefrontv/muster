// Settings → Agent Capabilities: what Muster hands to an agent without being asked.
//
// Everything here is on by default, because everything here was already on before the pane
// existed. The pane's job is to make that visible and reversible, not to change it.

import type React from 'react'
import { AlertTriangle } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/types'
import { isSitesMcpExposedToAgents } from '../../../../shared/agent-capabilities'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSubsectionHeader, SettingsSwitchRow } from './SettingsFormControls'
import { SiteMcpInstallCard } from './site-mcp-install-card'
import { getAgentCapabilitiesPaneSearchEntries } from './agent-capabilities-search'
import { translate } from '@/i18n/i18n'

export { getAgentCapabilitiesPaneSearchEntries }

type AgentCapabilitiesPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AgentCapabilitiesPane({
  settings,
  updateSettings
}: AgentCapabilitiesPaneProps): React.JSX.Element {
  const entries = getAgentCapabilitiesPaneSearchEntries()
  const [paneEntry, sitesMcpEntry, sitesMcpInstallEntry] = entries

  const sitesMcpEnabled = isSitesMcpExposedToAgents(settings)

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        {paneEntry.description}{' '}
        {translate(
          'auto.components.settings.AgentCapabilities.scopeNote',
          'These switches govern what your coding agents can reach, not what you can do in Muster.'
        )}
      </p>

      <section className="space-y-3">
        <SettingsSubsectionHeader
          title={translate('auto.components.settings.AgentCapabilities.sitesTitle', 'Site tools')}
        />
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {translate(
              'auto.components.settings.AgentCapabilities.sitesWarning',
              'These tools reach real infrastructure — WordPress deploys, uploads syncs, and remote database queries. Turning them off is a legitimate way to harden what an agent can touch.'
            )}
          </span>
        </div>
        <SearchableSetting {...sitesMcpEntry}>
          <SettingsSwitchRow
            label={sitesMcpEntry.title}
            description={sitesMcpEntry.description}
            checked={sitesMcpEnabled}
            onChange={() => updateSettings({ agentCapabilitySitesMcp: !sitesMcpEnabled })}
          />
        </SearchableSetting>
        <SearchableSetting {...sitesMcpInstallEntry}>
          <SiteMcpInstallCard enabled={sitesMcpEnabled} />
        </SearchableSetting>
      </section>

      {/* Bundled agent skills section removed from Settings on request: installs still run at
          startup and per-skill enable state persists; there is just no surface to toggle it. */}
    </div>
  )
}
