import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 text-[11px] leading-none font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-foreground/[0.07] text-foreground [a&]:hover:bg-foreground/[0.11]',
        dot: 'bg-background text-foreground border-border shadow-xs dark:bg-secondary dark:border-white/20',
        destructive:
          'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline: 'border-border/60 text-foreground [a&]:hover:bg-foreground/[0.07]',
        muted: 'bg-foreground/[0.07] text-muted-foreground',
        success:
          'border-status-success-border bg-status-success-background text-status-success-ink',
        attention:
          'border-status-attention-border bg-status-attention-background text-status-attention-ink',
        danger: 'border-status-danger-border bg-status-danger-background text-status-danger',
        info: 'border-status-info-border bg-status-info-background text-status-info',
        ghost: '[a&]:hover:bg-foreground/[0.07] [a&]:hover:text-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
