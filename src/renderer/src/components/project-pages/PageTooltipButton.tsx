// Pages icon buttons labelled with the app's styled tooltip (not a native title).
import type React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Label plus an optional shortcut hint, styled like the Sites header's. */
export function TooltipShortcutLabel({
  label,
  shortcut
}: {
  label: string
  shortcut?: string
}): React.JSX.Element {
  return (
    <>
      {label}
      {shortcut ? <kbd className="ml-1 font-sans text-muted-foreground">{shortcut}</kbd> : null}
    </>
  )
}

export function PageTooltipButton({
  label,
  shortcut,
  children,
  ...props
}: { label: string; shortcut?: string } & React.ComponentProps<typeof Button>): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        <TooltipShortcutLabel label={label} shortcut={shortcut} />
      </TooltipContent>
    </Tooltip>
  )
}
