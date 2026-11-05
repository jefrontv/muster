import * as React from 'react'

import { cn } from '@/lib/utils'

/** Multi-line twin of `Input`: same fill and focus ring, `rounded-xl` instead of a pill. */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          'w-full min-w-0 rounded-xl border-0 bg-foreground/[0.05] px-3 py-2 text-sm text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:ring-2 focus-visible:ring-ring',
          'aria-invalid:ring-2 aria-invalid:ring-destructive',
          className
        )}
        {...props}
      />
    )
  }
)

Textarea.displayName = 'Textarea'

export { Textarea }
