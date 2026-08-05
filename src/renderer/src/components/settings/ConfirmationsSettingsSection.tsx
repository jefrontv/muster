// One home for every "are you sure?" prompt.
//
// The persisted flags disagree with each other on polarity — four are `skip*` opt-outs, one is a
// positive `confirmClosePinnedTab` — because each was added next to the feature it guards. Every
// row here reads as "confirm before X" regardless, so the section is scannable and a user can
// answer "what will still stop me?" without translating double negatives.

import type React from 'react'
import type { GlobalSettings } from '../../../../shared/types'
import { Button } from '../ui/button'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSubsectionHeader, SettingsSwitchRow } from './SettingsFormControls'
import { getConfirmationSearchEntry, getConfirmationsSearchEntries } from './confirmations-search'
import { ALL_CONFIRMATIONS_ENABLED, hasSuppressedConfirmation } from './confirmation-settings'
import { translate } from '@/i18n/i18n'

export { getConfirmationsSearchEntries }
export { ALL_CONFIRMATIONS_ENABLED, hasSuppressedConfirmation }

type ConfirmationsSettingsSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function ConfirmationsSettingsSection({
  settings,
  updateSettings
}: ConfirmationsSettingsSectionProps): React.JSX.Element {
  const entry = getConfirmationSearchEntry()
  const anySuppressed = hasSuppressedConfirmation(settings)

  return (
    <section key="confirmations" className="space-y-4">
      <SettingsSubsectionHeader
        title={entry.section.title}
        description={translate(
          'auto.components.settings.Confirmations.description',
          'Prompts shown before an action you cannot undo. Turning one off applies everywhere, including keyboard shortcuts and the native menu.'
        )}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!anySuppressed}
            onClick={() => updateSettings({ ...ALL_CONFIRMATIONS_ENABLED })}
          >
            {translate(
              'auto.components.settings.Confirmations.resetAll',
              'Reset all confirmations'
            )}
          </Button>
        }
      />

      <SearchableSetting {...entry.deleteWorkspace}>
        <SettingsSwitchRow
          label={entry.deleteWorkspace.title}
          description={entry.deleteWorkspace.description}
          checked={!settings.skipDeleteWorktreeConfirm}
          onChange={() =>
            updateSettings({ skipDeleteWorktreeConfirm: !settings.skipDeleteWorktreeConfirm })
          }
        />
      </SearchableSetting>

      <SearchableSetting {...entry.closeBusyTerminal}>
        <SettingsSwitchRow
          label={entry.closeBusyTerminal.title}
          description={entry.closeBusyTerminal.description}
          checked={!settings.skipCloseTerminalWithRunningProcessConfirm}
          onChange={() =>
            updateSettings({
              skipCloseTerminalWithRunningProcessConfirm:
                !settings.skipCloseTerminalWithRunningProcessConfirm
            })
          }
        />
      </SearchableSetting>

      <SearchableSetting {...entry.deleteAutomation}>
        <SettingsSwitchRow
          label={entry.deleteAutomation.title}
          description={entry.deleteAutomation.description}
          checked={!settings.skipDeleteAutomationConfirm}
          onChange={() =>
            updateSettings({ skipDeleteAutomationConfirm: !settings.skipDeleteAutomationConfirm })
          }
        />
      </SearchableSetting>

      <SearchableSetting {...entry.codexRateLimitReset}>
        <SettingsSwitchRow
          label={entry.codexRateLimitReset.title}
          description={entry.codexRateLimitReset.description}
          checked={!settings.skipCodexRateLimitResetConfirm}
          onChange={() =>
            updateSettings({
              skipCodexRateLimitResetConfirm: !settings.skipCodexRateLimitResetConfirm
            })
          }
        />
      </SearchableSetting>

      <SearchableSetting {...entry.closePinnedTab}>
        <SettingsSwitchRow
          label={entry.closePinnedTab.title}
          description={entry.closePinnedTab.description}
          checked={settings.confirmClosePinnedTab ?? true}
          onChange={() =>
            updateSettings({ confirmClosePinnedTab: !(settings.confirmClosePinnedTab ?? true) })
          }
        />
      </SearchableSetting>
    </section>
  )
}
