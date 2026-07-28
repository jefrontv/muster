import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import { Slider } from '../ui/slider'
import { FileAudio, Volume2 } from 'lucide-react'
import { NotificationSoundPicker } from './NotificationSoundPicker'
import { translate } from '@/i18n/i18n'

type NotificationSoundSectionProps = {
  notificationSettings: GlobalSettings['notifications']
  notificationsEnabled: boolean
  volumeDraft: number
  onVolumeDraftChange: (value: number) => void
  onVolumeCommit: (value: number) => void
  onUpdateNotificationSettings: (updates: Partial<GlobalSettings['notifications']>) => Promise<void>
}

export function NotificationSoundSection({
  notificationSettings,
  notificationsEnabled,
  volumeDraft,
  onVolumeDraftChange,
  onVolumeCommit,
  onUpdateNotificationSettings
}: NotificationSoundSectionProps): React.JSX.Element {
  const selectedSoundId = notificationSettings.customSoundId
  const activeCollabSoundId = notificationSettings.activeCollabSoundId
  // One volume serves both pickers, so it stays reachable while either plays a file of ours.
  const playsOwnAudio =
    selectedSoundId !== 'system' ||
    (activeCollabSoundId !== 'global' && activeCollabSoundId !== 'system')

  return (
    <div className="space-y-2 py-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <FileAudio className="size-4" />
          <Label>
            {translate(
              'auto.components.settings.NotificationsPane.88686e6ca8',
              'Notification Sound'
            )}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.NotificationsPane.2a2033c388',
            'Choose the alert Muster plays when a desktop notification is delivered.'
          )}
        </p>
      </div>
      <NotificationSoundPicker
        value={selectedSoundId}
        customPath={notificationSettings.customSoundPath}
        volume={volumeDraft}
        disabled={!notificationsEnabled}
        ariaLabel={translate(
          'auto.components.settings.NotificationsPane.c258cb96dc',
          'Choose notification sound'
        )}
        onSelect={({ soundId, soundPath }) =>
          onUpdateNotificationSettings({
            // Never 'global': the global picker has nothing above it to inherit from.
            customSoundId: soundId === 'global' ? 'system' : soundId,
            ...(soundPath === undefined ? {} : { customSoundPath: soundPath })
          })
        }
      />
      {playsOwnAudio ? (
        <div className="flex items-center gap-3 pt-1">
          <Volume2 className="size-4 text-muted-foreground" />
          <Slider
            value={[volumeDraft]}
            min={0}
            max={100}
            step={5}
            disabled={!notificationsEnabled}
            onValueChange={([value]) => onVolumeDraftChange(value)}
            onValueCommit={([value]) => onVolumeCommit(value)}
            className="flex-1"
            aria-label={translate(
              'auto.components.settings.NotificationsPane.2a42dd8d6f',
              'Notification sound volume'
            )}
          />
          <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {volumeDraft}%
          </span>
        </div>
      ) : null}
    </div>
  )
}
