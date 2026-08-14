import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import { CalendarClock, ClipboardList, MessageSquare, PencilLine, Timer, UserPlus } from 'lucide-react'
import { clampActiveCollabPollIntervalMs } from '../../../../shared/activecollab-poll-interval'
import { NotificationSettingToggle } from './NotificationSettingToggle'
import { ActiveCollabNotificationDelivery } from './ActiveCollabNotificationDelivery'
import { SettingsRow, SettingsSegmentedControl } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

type ActiveCollabNotificationSectionProps = {
  notificationSettings: GlobalSettings['notifications']
  notificationsEnabled: boolean
  onUpdateNotificationSettings: (updates: Partial<GlobalSettings['notifications']>) => Promise<void>
  /** The stored cadence, raw; the poller clamps the same bounds this control renders. */
  pollIntervalMs: number | null | undefined
  onPollIntervalChange: (intervalMs: number) => void | Promise<void>
}

// Within the poller's clamp bounds (15s–15min); the value stored is milliseconds.
const POLL_INTERVAL_OPTIONS = [
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '1m' },
  { value: 180_000, label: '3m' },
  { value: 300_000, label: '5m' },
  { value: 900_000, label: '15m' }
] as const

/** The four ActiveCollab task alerts, grouped so the shared polling cost can be
 *  stated once. Split out of NotificationsPane to keep that file under budget. */
export function ActiveCollabNotificationSection({
  notificationSettings,
  notificationsEnabled,
  onUpdateNotificationSettings,
  pollIntervalMs,
  onPollIntervalChange
}: ActiveCollabNotificationSectionProps): React.JSX.Element {
  const effectiveInterval = clampActiveCollabPollIntervalMs(pollIntervalMs)
  return (
    <div className="space-y-1 py-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4" />
          <Label>
            {translate(
              'auto.components.settings.ActiveCollabNotificationSection.group',
              'ActiveCollab Tasks'
            )}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.ActiveCollabNotificationSection.groupDescription',
            'ActiveCollab has no webhooks, so Muster checks your ActiveCollab server on the cadence below whenever ActiveCollab is connected — the sidebar Tasks badge relies on it even with every banner off.'
          )}
        </p>
      </div>

      <div className="pl-6">
        <NotificationSettingToggle
          icon={<UserPlus className="size-4" />}
          label={translate(
            'auto.components.settings.ActiveCollabNotificationSection.assigned',
            'Task Assigned To You'
          )}
          description={translate(
            'auto.components.settings.ActiveCollabNotificationSection.assignedDescription',
            'A task you were not assigned before shows up on your ActiveCollab task list.'
          )}
          checked={notificationSettings.activeCollabAssigned}
          disabled={!notificationsEnabled}
          onToggle={() =>
            void onUpdateNotificationSettings({
              activeCollabAssigned: !notificationSettings.activeCollabAssigned
            })
          }
        />

        <NotificationSettingToggle
          icon={<MessageSquare className="size-4" />}
          label={translate(
            'auto.components.settings.ActiveCollabNotificationSection.comments',
            'New Comments'
          )}
          description={translate(
            'auto.components.settings.ActiveCollabNotificationSection.commentsDescription',
            'Someone posts a comment on a task assigned to you.'
          )}
          checked={notificationSettings.activeCollabComments}
          disabled={!notificationsEnabled}
          onToggle={() =>
            void onUpdateNotificationSettings({
              activeCollabComments: !notificationSettings.activeCollabComments
            })
          }
        />

        <NotificationSettingToggle
          icon={<CalendarClock className="size-4" />}
          label={translate(
            'auto.components.settings.ActiveCollabNotificationSection.due',
            'Due Date Getting Closer'
          )}
          description={translate(
            'auto.components.settings.ActiveCollabNotificationSection.dueDescription',
            'An assigned task moves into a nearer due window — this week, then tomorrow, then today, then overdue.'
          )}
          checked={notificationSettings.activeCollabDue}
          disabled={!notificationsEnabled}
          onToggle={() =>
            void onUpdateNotificationSettings({
              activeCollabDue: !notificationSettings.activeCollabDue
            })
          }
        />

        <NotificationSettingToggle
          icon={<PencilLine className="size-4" />}
          label={translate(
            'auto.components.settings.ActiveCollabNotificationSection.updated',
            'Task Details Edited'
          )}
          description={translate(
            'auto.components.settings.ActiveCollabNotificationSection.updatedDescription',
            'An assigned task is edited without a new comment — renamed, re-described, re-labelled, or its due date changed.'
          )}
          checked={notificationSettings.activeCollabUpdated}
          disabled={!notificationsEnabled}
          onToggle={() =>
            void onUpdateNotificationSettings({
              activeCollabUpdated: !notificationSettings.activeCollabUpdated
            })
          }
        />

        <SettingsRow
          label={
            <span className="flex items-center gap-2">
              <Timer className="size-4" />
              {translate(
                'auto.components.settings.ActiveCollabNotificationSection.pollInterval',
                'Check Every'
              )}
            </span>
          }
          description={translate(
            'auto.components.settings.ActiveCollabNotificationSection.pollIntervalDescription',
            'How often Muster asks ActiveCollab for changes. Shorter is fresher; longer is lighter on a shared server.'
          )}
          control={
            <SettingsSegmentedControl
              ariaLabel={translate(
                'auto.components.settings.ActiveCollabNotificationSection.pollInterval',
                'Check Every'
              )}
              size="sm"
              value={effectiveInterval}
              onChange={(intervalMs) => void onPollIntervalChange(intervalMs)}
              options={POLL_INTERVAL_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label
              }))}
            />
          }
        />

        <ActiveCollabNotificationDelivery
          notificationSettings={notificationSettings}
          notificationsEnabled={notificationsEnabled}
          onUpdateNotificationSettings={onUpdateNotificationSettings}
        />
      </div>
    </div>
  )
}
