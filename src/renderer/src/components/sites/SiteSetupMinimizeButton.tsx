// "Get out of my way, keep working" — the control that sends a setup to the status bar.
//
// Deliberately NOT the dialog's close button. Close ends the flow, and on the git-clone dialog it
// aborts the clone outright; this leaves everything running and only takes the panel off screen.
// Two buttons because they are two intentions, and conflating them would make one of them a trap.

import type React from 'react'
import { Minus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

export function SiteSetupMinimizeButton({
  onMinimize
}: {
  onMinimize: () => void
}): React.JSX.Element {
  const label = translate(
    'auto.components.sites.SiteSetupMinimizeButton.minimize',
    'Minimize: keep this running in the status bar'
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onMinimize}
          // Same box as the dialog's close button (size-7 at right-4), one slot to its left.
          className="absolute top-4 right-12 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          aria-label={label}
        >
          <Minus className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
