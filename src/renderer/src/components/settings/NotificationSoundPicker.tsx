import { useState } from 'react'
import { toast } from 'sonner'
import type { NotificationEventSource, NotificationSoundId } from '../../../../shared/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '../ui/select'
import { Link2, Upload } from 'lucide-react'
import { getNotificationSoundOptions } from '@/components/notification-sound-options'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'

const CHOOSE_CUSTOM_SOUND_VALUE = 'choose-custom-file'
const INHERIT_SOUND_VALUE = 'global'

export type NotificationSoundSelection = NotificationSoundId | typeof INHERIT_SOUND_VALUE

type NotificationSoundSelectValue = NotificationSoundSelection | typeof CHOOSE_CUSTOM_SOUND_VALUE

type NotificationSoundPickerProps = {
  value: NotificationSoundSelection
  /** Custom file backing this picker's own `'custom'` choice. */
  customPath: string | null
  volume: number
  disabled: boolean
  ariaLabel: string
  /**
   * Turns this into an override picker: renders an explicit "use the global sound" entry naming
   * what it defers to, so inheriting is a visible state rather than a blank field.
   */
  inherit?: { soundId: NotificationSoundId; customPath: string | null }
  /** Preview through this source, so an override auditions itself and not the global sound. */
  previewSource?: NotificationEventSource
  onSelect: (selection: {
    soundId: NotificationSoundSelection
    soundPath?: string
  }) => Promise<void>
}

/** The sound dropdown, shared by the global picker and the ActiveCollab override. */
export function NotificationSoundPicker({
  value,
  customPath,
  volume,
  disabled,
  ariaLabel,
  inherit,
  previewSource,
  onSelect
}: NotificationSoundPickerProps): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [isPickingSound, setIsPickingSound] = useState(false)

  const previewSound = async (selection: NotificationSoundSelection): Promise<void> => {
    const resolved = selection === INHERIT_SOUND_VALUE ? inherit?.soundId : selection
    // 'system' has no file of ours to play — the OS makes that noise when the banner lands.
    if (resolved === undefined || resolved === 'system') {
      return
    }
    const result = await window.api.notifications.playSound({
      force: true,
      volume,
      ...(previewSource ? { source: previewSource } : {})
    })
    if (!result.played) {
      toast.error(
        translate(
          'auto.components.settings.NotificationsPane.0fadad17ce',
          'Notification sound could not be played'
        )
      )
    }
  }

  const handleChooseCustomSound = async (): Promise<void> => {
    setIsPickingSound(true)
    try {
      const soundPath = await window.api.shell.pickAudio()
      if (soundPath) {
        await onSelect({ soundId: 'custom', soundPath })
        await previewSound('custom')
      }
    } finally {
      if (mountedRef.current) {
        setIsPickingSound(false)
      }
    }
  }

  const handleSoundSelect = async (selected: NotificationSoundSelectValue): Promise<void> => {
    if (selected === CHOOSE_CUSTOM_SOUND_VALUE) {
      await handleChooseCustomSound()
      return
    }
    await onSelect({ soundId: selected })
    await previewSound(selected)
  }

  const soundOptions = getNotificationSoundOptions(customPath)
  const inheritedTitle = inherit
    ? getNotificationSoundOptions(inherit.customPath).find(
        (option) => option.id === inherit.soundId
      )?.title
    : undefined

  return (
    <>
      <Select
        value={value}
        disabled={disabled || isPickingSound}
        onValueChange={(selected) =>
          void handleSoundSelect(selected as NotificationSoundSelectValue)
        }
      >
        <SelectTrigger className="w-full max-w-[360px]" size="sm" aria-label={ariaLabel}>
          <SelectValue
            placeholder={translate(
              'auto.components.settings.NotificationsPane.c258cb96dc',
              'Choose notification sound'
            )}
          />
        </SelectTrigger>
        <SelectContent align="start" className="w-[--radix-select-trigger-width]">
          {inherit ? (
            <>
              <SelectItem value={INHERIT_SOUND_VALUE}>
                <Link2 className="size-4" />
                <span className="truncate">
                  {translate(
                    'auto.components.settings.NotificationSoundPicker.inherit',
                    'Use Global Sound'
                  )}
                  {inheritedTitle ? ` · ${inheritedTitle}` : ''}
                </span>
              </SelectItem>
              <SelectSeparator />
            </>
          ) : null}
          {soundOptions.map((option) => {
            const OptionIcon = option.icon
            return (
              <SelectItem key={option.id} value={option.id}>
                <OptionIcon className="size-4" />
                <span className="truncate">{option.title}</span>
              </SelectItem>
            )
          })}
          <SelectSeparator />
          <SelectItem value={CHOOSE_CUSTOM_SOUND_VALUE}>
            <Upload className="size-4" />
            <span>
              {customPath
                ? translate(
                    'auto.components.settings.NotificationsPane.76e02467b8',
                    'Change Custom File'
                  )
                : translate(
                    'auto.components.settings.NotificationsPane.6e6df3a09a',
                    'Choose Custom File'
                  )}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {customPath ? (
        <p className="truncate font-mono text-[11px] text-muted-foreground" title={customPath}>
          {translate('auto.components.settings.NotificationsPane.4aa5085cd7', 'Custom:')}{' '}
          {customPath}
        </p>
      ) : null}
    </>
  )
}
