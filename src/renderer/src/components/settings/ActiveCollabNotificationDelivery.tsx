import type { ActiveCollabNotificationStyle, GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { NotificationSoundPicker } from './NotificationSoundPicker'
import { getActiveCollabNotificationStyleOptions } from './activecollab-notification-style-options'
import { translate } from '@/i18n/i18n'

type ActiveCollabNotificationDeliveryProps = {
  notificationSettings: GlobalSettings['notifications']
  notificationsEnabled: boolean
  onUpdateNotificationSettings: (updates: Partial<GlobalSettings['notifications']>) => Promise<void>
}

/** How ActiveCollab alerts sound and read, once the toggles above have decided that they fire. */
export function ActiveCollabNotificationDelivery({
  notificationSettings,
  notificationsEnabled,
  onUpdateNotificationSettings
}: ActiveCollabNotificationDeliveryProps): React.JSX.Element {
  const styleOptions = getActiveCollabNotificationStyleOptions()

  return (
    <div className="space-y-3 pt-2">
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">
          {translate(
            'auto.components.settings.ActiveCollabNotificationSection.soundLabel',
            'ActiveCollab Sound'
          )}
        </Label>
        <NotificationSoundPicker
          value={notificationSettings.activeCollabSoundId}
          customPath={notificationSettings.activeCollabSoundPath}
          volume={notificationSettings.customSoundVolume}
          disabled={!notificationsEnabled}
          ariaLabel={translate(
            'auto.components.settings.ActiveCollabNotificationSection.soundLabel',
            'ActiveCollab Sound'
          )}
          inherit={{
            soundId: notificationSettings.customSoundId,
            customPath: notificationSettings.customSoundPath
          }}
          previewSource="activecollab-assigned"
          onSelect={({ soundId, soundPath }) =>
            onUpdateNotificationSettings({
              activeCollabSoundId: soundId,
              ...(soundPath === undefined ? {} : { activeCollabSoundPath: soundPath })
            })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">
          {translate(
            'auto.components.settings.ActiveCollabNotificationSection.styleLabel',
            'Banner Wording'
          )}
        </Label>
        <Select
          value={notificationSettings.activeCollabStyle}
          disabled={!notificationsEnabled}
          onValueChange={(value) =>
            void onUpdateNotificationSettings({
              activeCollabStyle: value as ActiveCollabNotificationStyle
            })
          }
        >
          <SelectTrigger
            className="w-full max-w-[360px]"
            size="sm"
            aria-label={translate(
              'auto.components.settings.ActiveCollabNotificationSection.styleLabel',
              'Banner Wording'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" className="w-[--radix-select-trigger-width]">
            {styleOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="truncate">{option.title}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {styleOptions.find((option) => option.id === notificationSettings.activeCollabStyle)
            ?.example ?? ''}
        </p>
      </div>
    </div>
  )
}
