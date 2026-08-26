// "Add to sidebar" as a split button: the left half runs the action once, the right half opens the
// standing preference behind it.
//
// Why split rather than two buttons or a menu item: the action is the common case and stays one
// click, while the automatic version is a setting the user visits once — burying the action inside a
// menu would cost every user a click to save one for the few who toggle.

import { ChevronDown, FolderPlus } from 'lucide-react'
import type React from 'react'
import { useId } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { SettingsSwitch } from '@/components/settings/SettingsFormControls'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export function AddToSidebarButton({
  busy,
  autoAdd,
  onAdd,
  onAutoAddChange
}: {
  busy: boolean
  autoAdd: boolean
  onAdd: () => void
  onAutoAddChange: (next: boolean) => void
}): React.JSX.Element {
  const switchId = useId()
  const addLabel = translate('auto.components.sites.SitesPage.addToSidebar', 'Add to sidebar')
  const optionsLabel = translate(
    'auto.components.sites.SitesPage.addToSidebarOptions',
    'Add to sidebar options'
  )

  return (
    // Negative gap + rounding overrides fuse the two halves into one control: a visible gap reads as
    // two unrelated buttons, and a shared border reads as one with a menu.
    <div className="flex shrink-0 items-stretch">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-r-none pr-2"
        disabled={busy}
        onClick={onAdd}
      >
        <FolderPlus className="size-3.5" />
        {addLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={optionsLabel}
            className="rounded-l-none border-l border-border/60 px-1.5"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-3">
          {/* A real switch, not a checkbox menu item: a tick floating beside two lines of prose
              reads as a message rather than a control. Label left, switch right — the same shape
              every row in Settings uses, so it is recognisably a setting. */}
          <div className="flex items-start justify-between gap-3">
            <label htmlFor={switchId} className="min-w-0 cursor-pointer space-y-0.5">
              <span className="block text-[13px] font-medium leading-none text-foreground">
                {translate(
                  'auto.components.sites.SitesPage.autoAddDiscovered',
                  'Add new sites automatically'
                )}
              </span>
              <span className="block text-[11px] leading-snug text-muted-foreground">
                {translate(
                  'auto.components.sites.SitesPage.autoAddDiscoveredHint',
                  'New folders found under your site folders become sidebar projects on their own, with no setup.'
                )}
              </span>
            </label>
            <span id={switchId} className="pt-0.5">
              <SettingsSwitch
                checked={autoAdd}
                ariaLabel={translate(
                  'auto.components.sites.SitesPage.autoAddDiscovered',
                  'Add new sites automatically'
                )}
                onChange={() => onAutoAddChange(!autoAdd)}
              />
            </span>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
