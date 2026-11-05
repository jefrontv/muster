import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { translate } from '@/i18n/i18n'
import { Switch } from '@/components/ui/switch'

type BrowserLinkRoutingSettingProps = {
  settings: GlobalSettings
  linkRoutingDescription: string
  isMac: boolean
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function BrowserLinkRoutingSetting({
  settings,
  linkRoutingDescription,
  isMac,
  updateSettings
}: BrowserLinkRoutingSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate('auto.components.settings.BrowserPane.d3eb69c0aa', 'Link routing')}
      description={linkRoutingDescription}
      keywords={[
        'browser',
        'preview',
        'links',
        'localhost',
        'webview',
        'markdown',
        isMac ? 'cmd' : 'ctrl',
        'file',
        'editor'
      ]}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="space-y-0.5">
        <Label>
          {translate('auto.components.settings.BrowserPane.d3eb69c0aa', 'Link routing')}
        </Label>
        <p className="text-xs text-muted-foreground">{linkRoutingDescription}</p>
      </div>
      <Switch
        checked={settings.openLinksInApp}
        onClick={() =>
          updateSettings({
            openLinksInApp: !settings.openLinksInApp,
            openLinksInAppPreferencePrompted: true
          })
        }
      />
    </SearchableSetting>
  )
}
