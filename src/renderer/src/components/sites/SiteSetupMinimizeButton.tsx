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
    'Minimize — keep this running in the status bar'
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onMinimize}
          // Sits left of the dialog's own close button, which is absolutely positioned at right-4.
          className="absolute top-4 right-10 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden"
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
