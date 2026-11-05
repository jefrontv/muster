import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-[color,background-color,box-shadow] outline-none hover:bg-foreground/[0.07] hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-foreground data-[state=on]:text-background dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-border/60 bg-transparent',
        // A segment inside ToggleGroup's segmented track; matches the app mode switch.
        segmented:
          'h-full min-w-0 flex-1 basis-0 bg-transparent px-2 text-foreground/70 hover:bg-foreground/[0.06] data-[state=on]:hover:bg-foreground'
      },
      size: {
        default: 'h-9 min-w-9 px-2',
        sm: 'h-8 min-w-8 px-1.5',
        lg: 'h-10 min-w-10 px-2.5'
      }
    },
    // Segments fill their track; without this the default size's h-9 overflows a 32px track.
    compoundVariants: [{ variant: 'segmented', class: 'h-full min-w-0 px-2' }],
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
