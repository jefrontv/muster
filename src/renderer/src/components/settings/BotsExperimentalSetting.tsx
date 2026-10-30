import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import { getExperimentalSearchEntry } from './experimental-search'
import { BotsComposioKeySetting } from './BotsComposioKeySetting'

export function BotsExperimentalSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const enabled = settings.experimentalBots === true
  return (
    <SearchableSetting
      title={translate('auto.components.settings.ExperimentalPane.bots.title', 'Muster Bots')}
      description={translate(
        'auto.components.settings.ExperimentalPane.bots.description',
        'A Bots tab beside Chat and Code: AI bots with their own instructions, schedules and connected apps.'
      )}
      keywords={getExperimentalSearchEntry().bots.keywords}
      className="space-y-3 py-2"
      id="experimental-bots"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {translate('auto.components.settings.ExperimentalPane.bots.title', 'Muster Bots')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.bots.copy',
              'Adds a Bots tab at the top of the sidebar. Bots run on your Claude and Codex accounts and start when you first open the tab.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={enabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.bots.toggleLabel',
            'Toggle Muster Bots'
          )}
          onChange={() => updateSettings({ experimentalBots: !enabled })}
        />
      </div>
      {enabled ? <BotsComposioKeySetting /> : null}
    </SearchableSetting>
  )
}
