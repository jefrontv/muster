'use client'

import * as React from 'react'
import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Bots look: a filled control that inverts when checked, like a selected chip.
        'peer size-4 shrink-0 rounded-[5px] bg-foreground/[0.06] outline-none ring-1 ring-inset ring-foreground/20 transition-colors hover:bg-foreground/[0.1] focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=checked]:text-background data-[state=checked]:ring-foreground data-[state=indeterminate]:bg-foreground data-[state=indeterminate]:text-background data-[state=indeterminate]:ring-foreground',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current duration-150 data-[state=checked]:animate-in data-[state=checked]:zoom-in-50"
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
