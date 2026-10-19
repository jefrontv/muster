import { useId } from 'react'
import type React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The 24px process row: icon that turns into a chevron on hover, label, and a body below. */
export function ChatDisclosureRow(props: {
  icon: React.ReactNode
  label: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  const bodyId = useId()
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={props.open}
        aria-controls={props.open ? bodyId : undefined}
        onClick={() => props.onOpenChange(!props.open)}
        className="group flex h-6 w-full min-w-0 items-center gap-2 rounded-sm text-left text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          <span className="flex transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
            {props.icon}
          </span>
          <ChevronRight
            className={cn(
              'absolute size-3.5 opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100',
              props.open && 'rotate-90'
            )}
            aria-hidden
          />
        </span>
        {props.label}
      </button>
      {props.open && (
        <div id={bodyId} className="pb-1 pl-6 pt-0.5">
          {props.children}
        </div>
      )}
    </div>
  )
}
