import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

type BrowserFloatingLinkSettingProps = {
  settings: Pick<
    GlobalSettings,
    'openLinksInApp' | 'openLinksInFloatingBrowser' | 'floatingTerminalEnabled'
  >
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserFloatingLinkSetting({
  settings,
  updateSettings
}: BrowserFloatingLinkSettingProps): React.JSX.Element {
  const title = translate(
    'auto.components.settings.BrowserFloatingLinkSetting.a1c4f0b2e7',
    'Open Links in Floating Browser'
  )
  const description = translate(
    'auto.components.settings.BrowserFloatingLinkSetting.b3d7e9a145',
    'Open in-app links in the floating workspace panel instead of a workspace browser tab, so the current view stays put.'
  )
  // Prerequisites: in-app routing sends links to a browser at all, and the floating
  // workspace must be enabled for the panel to exist.
  const unavailableReason =
    settings.openLinksInApp !== true
      ? translate(
          'auto.components.settings.BrowserFloatingLinkSetting.c5f1a8b930',
          'Turn on Link Routing to use the floating browser.'
        )
      : settings.floatingTerminalEnabled !== true
        ? translate(
            'auto.components.settings.BrowserFloatingLinkSetting.d2e6c4f817',
            'Enable the floating workspace to use the floating browser.'
          )
        : null

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['browser', 'links', 'floating', 'panel', 'overlay', 'workspace', 'popup']}
    >
      <SettingsSwitchRow
        label={title}
        description={unavailableReason ?? description}
        checked={settings.openLinksInFloatingBrowser === true}
        disabled={unavailableReason !== null}
        onChange={() =>
          updateSettings({
            openLinksInFloatingBrowser: settings.openLinksInFloatingBrowser !== true
          })
        }
      />
    </SearchableSetting>
  )
}
