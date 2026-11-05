import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-full border-0 bg-foreground/[0.05] px-3.5 py-1 text-base transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:ring-2 focus-visible:ring-ring',
          'aria-invalid:ring-2 aria-invalid:ring-destructive',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

/** Shell for a compact search field with icon and clear button; the inner input stays bare. */
const SEARCH_FIELD_SHELL =
  'flex h-7 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 focus-within:ring-2 focus-within:ring-ring'
const SEARCH_FIELD_INPUT =
  'min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground'

export { Input, SEARCH_FIELD_INPUT, SEARCH_FIELD_SHELL }
