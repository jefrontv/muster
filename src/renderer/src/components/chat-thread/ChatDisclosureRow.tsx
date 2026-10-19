import { useId } from 'react'
import type React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The 24px process row: icon that turns into a chevron on hover, label, and a body below. */
export function ChatDisclosureRow(props: {
  icon: React.ReactNode
  label: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shimmers the label while the step runs. */
  live?: boolean
  headerClassName?: string
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
          'group/row flex h-(--chat-row-height) w-full min-w-0 items-center gap-1.5 rounded-sm text-left text-[13px] text-chat-ink-tertiary transition-colors duration-100 ease-chat hover:text-chat-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent motion-reduce:transition-none',
          props.headerClassName
        )}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          {props.open ? (
            <ChevronUp className="size-3.5" data-chevron="up" aria-hidden />
          ) : (
            <>
              <span className="flex transition-opacity duration-100 ease-chat group-hover/row:opacity-0 group-focus-visible/row:opacity-0 motion-reduce:transition-none">
                {props.icon}
              </span>
              <ChevronDown
                className="absolute size-3.5 opacity-0 transition-opacity duration-100 ease-chat group-hover/row:opacity-100 group-focus-visible/row:opacity-100 motion-reduce:transition-none"
                data-chevron="down"
                aria-hidden
              />
            </>
          )}
        </span>
        <span className={cn('flex min-w-0 items-center', props.live && 'chat-shimmer')}>
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

/** The 2px caption dot DSH puts between a row's title and its summary. */
export function ChatRowDot(): React.JSX.Element {
  return <span className="mx-2 size-0.5 shrink-0 rounded-[1px] bg-chat-ink-caption" aria-hidden />
}
