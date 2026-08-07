import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import { getExperimentalSearchEntry } from './experimental-search'

export function ChatModeExperimentalSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const enabled = settings.experimentalChatMode === true
  return (
    <SearchableSetting
      title={translate('auto.components.settings.ExperimentalPane.chatMode.title', 'Chat mode')}
      description={translate(
        'auto.components.settings.ExperimentalPane.chatMode.description',
        'A dedicated Chat surface with simple workspaces and chat threads, beside the Code view.'
      )}
      keywords={getExperimentalSearchEntry().chatMode.keywords}
      className="space-y-3 py-2"
      id="experimental-chat-mode"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {translate('auto.components.settings.ExperimentalPane.chatMode.title', 'Chat mode')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.chatMode.copy',
              'Adds a Chat/Code switch at the top of the sidebar. Chat workspaces are just a name plus folders, with chat threads inside — no branches or worktrees.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={enabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.chatMode.toggleLabel',
            'Toggle Chat mode'
          )}
          onChange={() => updateSettings({ experimentalChatMode: !enabled })}
        />
      </div>
    </SearchableSetting>
  )
}
