import type * as React from 'react'

import { cn } from '@/lib/utils'

type SwitchProps = Omit<React.ComponentProps<'button'>, 'onChange' | 'role'> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

const TRACK =
  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors'
const THUMB =
  'pointer-events-none block size-3.5 rounded-full bg-background shadow-xs ring-1 ring-foreground/10 transition-transform'

/** The switch's look without the control, for rows that are themselves role="switch". */
function SwitchTrack({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn(TRACK, checked ? 'bg-foreground' : 'bg-switch-off', className)}>
      <span className={cn(THUMB, checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </span>
  )
}

/** The one on/off switch: 20x36 track, foreground fill when on. */
function Switch({ checked, onCheckedChange, className, onClick, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        TRACK,
        'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-foreground' : 'bg-switch-off',
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked)
        }
      }}
      {...props}
    >
      <span aria-hidden className={cn(THUMB, checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
}

export { Switch, SwitchTrack }
