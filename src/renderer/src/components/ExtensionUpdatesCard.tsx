// The corner card that says some of your extensions have moved on.
//
// It never stacks with the app's own update card: that one matters more, and two cards in the same
// corner read as spam rather than as information. Dismissal is keyed to the exact version, so
// saying "later" silences this update and nothing else.

import { Blocks, X } from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../store'
import { useExtensionInventory } from '@/hooks/useExtensionInventory'
import { useExtensionPreferences } from '@/hooks/useExtensionPreferences'
import {
  extensionDismissalKey,
  pendingExtensionUpdates,
  summarizeExtensionUpdates
} from './extensions/extension-update-notice'

export function ExtensionUpdatesCard(): React.JSX.Element | null {
  const { inventory } = useExtensionInventory()
  const preferences = useExtensionPreferences()
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)

  const pending = pendingExtensionUpdates(inventory, preferences.dismissals)
  if (pending.length === 0) {
    return null
  }

  // Why dismissing goes through settings rather than an IPC call: the card reads its own dismissals
  // from this side's settings, so a write that only landed in the main process left it on screen.
  const dismiss = async (): Promise<void> => {
    await preferences.dismiss(
      pending
        .map((item) => extensionDismissalKey(item))
        .filter((key): key is string => key !== null)
    )
  }

  const review = (): void => {
    void dismiss()
    openSettingsTarget({ pane: 'extensions', repoId: null })
    openSettingsPage()
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 p-3 shadow-lg" data-testid="extension-updates-card">
      <div className="flex items-start gap-3">
        <Blocks className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">
            {pending.length === 1
              ? translate('auto.components.extensions.card_one', '1 extension update')
              : translate(
                  'auto.components.extensions.card_many',
                  '{{count}} extension updates'
                ).replace('{{count}}', String(pending.length))}
          </p>
          <p className="text-xs text-muted-foreground">{summarizeExtensionUpdates(pending)}</p>
          <div className="flex gap-2 pt-1">
            <Button size="xs" onClick={review}>
              {translate('auto.components.extensions.card_review', 'Review')}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void dismiss()}>
              {translate('auto.components.extensions.card_later', 'Later')}
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('auto.components.extensions.card_dismiss', 'Dismiss')}
          onClick={() => void dismiss()}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </Card>
  )
}
