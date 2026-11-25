// One layout for toasts that ask for an action: icon, three lines of text, actions centred beside them.

import type React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function ActionToast({
  toastId,
  icon,
  eyebrow,
  title,
  meta,
  primaryLabel,
  onPrimary,
  secondaryLabel
}: {
  toastId: string | number
  icon: React.ReactNode
  eyebrow: string
  title: string
  meta?: string
  primaryLabel: string
  onPrimary: () => void
  /** Dismisses the toast; the item stays waiting wherever it lives. */
  secondaryLabel?: string
}): React.JSX.Element {
  return (
    <div className="flex w-[var(--width)] items-center gap-3 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-attention-background text-status-attention">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{eyebrow}</p>
        <p className="truncate text-sm font-medium">{title}</p>
        {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {secondaryLabel ? (
          <Button variant="ghost" size="sm" onClick={() => toast.dismiss(toastId)}>
            {secondaryLabel}
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => {
            toast.dismiss(toastId)
            onPrimary()
          }}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  )
}
