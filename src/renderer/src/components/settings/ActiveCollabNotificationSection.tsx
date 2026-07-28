import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import { CalendarClock, ClipboardList, MessageSquare, PencilLine, UserPlus } from 'lucide-react'
import { NotificationSettingToggle } from './NotificationSettingToggle'
import { ActiveCollabNotificationDelivery } from './ActiveCollabNotificationDelivery'
import { translate } from '@/i18n/i18n'

type ActiveCollabNotificationSectionProps = {
  notificationSettings: GlobalSettings['notifications']
  notificationsEnabled: boolean
  onUpdateNotificationSettings: (updates: Partial<GlobalSettings['notifications']>) => Promise<void>
}

/** The four ActiveCollab task alerts, grouped so the shared polling cost can be
 *  stated once. Split out of NotificationsPane to keep that file under budget. */
export function ActiveCollabNotificationSection({
  notificationSettings,
  notificationsEnabled,
  onUpdateNotificationSettings
}: ActiveCollabNotificationSectionProps): React.JSX.Element {
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
            'ActiveCollab has no webhooks, so Muster checks your ActiveCollab server every 3 minutes in the background while any of these are on.'
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

        <ActiveCollabNotificationDelivery
          notificationSettings={notificationSettings}
          notificationsEnabled={notificationsEnabled}
          onUpdateNotificationSettings={onUpdateNotificationSettings}
        />
      </div>
    </div>
  )
}
