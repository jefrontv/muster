// Agent access to Pages. Shown only while the experimental Pages view is on.
import type React from 'react'
import {
  isCrossProjectPagesAllowed,
  projectPagesAgentAccess,
  type ProjectPagesAgentAccess
} from '../../../../shared/agent-capabilities'
import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSubsectionHeader, SettingsSwitchRow } from './SettingsFormControls'

const LEVELS: { value: ProjectPagesAgentAccess; label: () => string }[] = [
  {
    value: 'write',
    label: () => translate('auto.components.settings.pagesAccess.write', 'Read and edit')
  },
  {
    value: 'read',
    label: () => translate('auto.components.settings.pagesAccess.read', 'Read only')
  },
  { value: 'off', label: () => translate('auto.components.settings.pagesAccess.off', 'Off') }
]

export function ProjectPagesAgentAccessSection({
  settings,
  updateSettings,
  sitesMcpEnabled
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  sitesMcpEnabled: boolean
}): React.JSX.Element {
  const access = projectPagesAgentAccess(settings)
  const crossProject = isCrossProjectPagesAllowed(settings)
  const accessTitle = translate(
    'auto.components.settings.pagesAccess.title',
    'Agent access to Pages'
  )
  const crossTitle = translate(
    'auto.components.settings.pagesAccess.crossTitle',
    "Let agents use other projects' pages"
  )
  const crossDescription = translate(
    'auto.components.settings.pagesAccess.crossDescription',
    'Off keeps each agent to the pages of the project it runs in. Pages can hold client details.'
  )
  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate('auto.components.settings.pagesAccess.section', 'Pages')}
      />
      <SearchableSetting
        title={accessTitle}
        description=""
        keywords={['pages', 'notes', 'agents', 'access']}
        id="agent-capability-pages"
      >
        <SettingsRow
          label={accessTitle}
          description={translate(
            'auto.components.settings.pagesAccess.description',
            'What coding agents can do with Pages through the Muster site tools.'
          )}
          control={
            <Select
              value={access}
              disabled={!sitesMcpEnabled}
              onValueChange={(value) =>
                updateSettings({ agentCapabilityProjectPages: value as ProjectPagesAgentAccess })
              }
            >
              <SelectTrigger className="w-40" aria-label={accessTitle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SearchableSetting>
      <SearchableSetting
        title={crossTitle}
        description={crossDescription}
        keywords={['pages', 'cross project', 'other projects']}
        id="agent-capability-pages-cross-project"
      >
        <SettingsSwitchRow
          label={crossTitle}
          description={crossDescription}
          checked={crossProject}
          disabled={!sitesMcpEnabled || access === 'off'}
          onChange={() =>
            updateSettings({ agentCapabilityProjectPagesCrossProject: !crossProject })
          }
        />
      </SearchableSetting>
    </section>
  )
}
