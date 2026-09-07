// The edit / save / cancel affordance that lives inside a site config field.
//
// Its own file so SiteEditableField stays about editing state rather than button chrome, and so
// the three buttons cannot drift apart in size, tint, or tooltip shape.

import type React from 'react'
import { Button } from '@/components/ui/button'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function SiteFieldActionButton({
  icon,
  /** Screen-reader name; carries the field label, unlike the short visual tooltip. */
  ariaLabel,
  tooltip,
  /** Key cap shown after the tooltip label. Omitted on cancel — see STYLEGUIDE UX rule 3. */
  shortcutKey,
  onClick
}: {
  icon: React.ReactNode
  ariaLabel: string
  tooltip: string
  shortcutKey?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    // A local provider so the button works wherever it is mounted, including tests and any
    // surface outside the app shell's provider. Nested Radix providers are supported.
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={ariaLabel}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="flex items-center gap-1.5">
          {tooltip}
          {shortcutKey ? (
            <ShortcutKeyCombo
              keys={[shortcutKey]}
              keyCapClassName="border-background/25 bg-background/15 text-background"
            />
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
