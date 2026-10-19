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
  /** Shimmers the label while the step runs. */
  live?: boolean
  bodyClassName?: string
  children: React.ReactNode
}): React.JSX.Element {
  const bodyId = useId()
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={props.open}
        aria-controls={props.open ? bodyId : undefined}
        aria-busy={props.live || undefined}
        onClick={() => props.onOpenChange(!props.open)}
        className={cn(
          'group/row flex h-(--chat-row-height) w-full min-w-0 items-center gap-1.5 rounded-sm text-left text-[13px] text-chat-ink-tertiary transition-colors duration-100 hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          props.open && 'text-chat-ink-secondary'
        )}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          <span className="flex transition-opacity duration-100 group-hover/row:opacity-0 group-focus-visible/row:opacity-0">
            {props.icon}
          </span>
          <ChevronRight
            className={cn(
              'absolute size-3.5 opacity-0 transition-[opacity,transform] duration-100 group-hover/row:opacity-100 group-focus-visible/row:opacity-100',
              props.open && 'rotate-90'
            )}
            aria-hidden
          />
        </span>
        <span className={cn('flex min-w-0 items-center gap-2', props.live && 'chat-shimmer')}>
          {props.label}
        </span>
      </button>
      {props.open && (
        <div id={bodyId} className={cn('pb-1 pl-[22px] pt-1', props.bodyClassName)}>
          {props.children}
        </div>
      )}
    </div>
  )
}

/** The 2px dot DSH puts between a row's title and its summary. */
export function ChatRowDot(): React.JSX.Element {
  return <span className="size-0.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden />
}
