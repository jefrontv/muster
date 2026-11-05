'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { SearchIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  children,
  title = 'Command Palette',
  description = 'Search for a command to run...',
  shouldFilter,
  onOpenAutoFocus,
  onCloseAutoFocus,
  contentClassName,
  overlayClassName,
  commandProps,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & {
  title?: string
  description?: string
  shouldFilter?: boolean
  onOpenAutoFocus?: (e: Event) => void
  onCloseAutoFocus?: (e: Event) => void
  contentClassName?: string
  overlayClassName?: string
  commandProps?: React.ComponentProps<typeof CommandPrimitive>
}) {
  const { className: commandClassName, ...commandRootProps } = commandProps ?? {}

  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          // Why: matches the DialogOverlay recipe — deeper scrim + 2px backdrop
          // blur so the dark canvas lifts off the command palette. A flat
          // bg-black/50 disappears in dark mode.
          className={cn(
            'fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
            overlayClassName
          )}
        />
        <DialogPrimitive.Content
          // One palette recipe (the Jump palette's): opaque floating sheet at 16px.
          className={cn(
            'fixed top-[13%] left-[50%] z-50 w-[660px] max-w-[94vw] translate-x-[-50%] overflow-hidden rounded-[16px] border border-foreground/10 bg-popover-solid text-foreground shadow-floating outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            contentClassName
          )}
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          <Command
            shouldFilter={shouldFilter}
            className={cn(
              'bg-transparent [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0',
              // Larger search and inset rows for the full-width palette.
              '[&_[data-cmdk-input-wrapper]]:mx-3 [&_[data-cmdk-input-wrapper]]:mt-3 [&_[data-cmdk-input-wrapper]]:mb-0 [&_[data-cmdk-input-wrapper]]:h-11 [&_[data-cmdk-input-wrapper]]:px-4 [&_[cmdk-input]]:text-[14px]',
              '[&_[cmdk-list]]:px-2.5 [&_[cmdk-list]]:pt-2 [&_[cmdk-list]]:pb-2.5 [&_[cmdk-item]]:rounded-xl [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item][data-selected=true]]:bg-foreground/[0.07]',
              // Group labels match MENU_LABEL: 12px sentence case.
              '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:leading-4 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
              commandClassName
            )}
            {...commandRootProps}
          >
            {children}
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandInput({
  className,
  wrapperClassName,
  iconClassName,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  wrapperClassName?: string
  iconClassName?: string
}) {
  return (
    <div
      // Pill search inset in its picker, like the palettes; no focus ring since it always holds focus.
      className={cn(
        'm-1.5 flex h-8 items-center gap-2 rounded-full bg-foreground/[0.05] px-3',
        wrapperClassName
      )}
      data-cmdk-input-wrapper=""
    >
      <SearchIcon className={cn('size-3.5 shrink-0 text-muted-foreground', iconClassName)} />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'flex h-full w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  const internalRef = React.useRef<HTMLDivElement>(null)

  // Why: Radix Dialog applies react-remove-scroll which calls preventDefault()
  // on wheel events for portaled elements (e.g. Popover) outside the Dialog's
  // DOM tree. The scrollbar renders (CSS overflow works) but the browser never
  // scrolls because the native event is cancelled. A non-passive wheel listener
  // directly on the list takes over scrolling manually so it works regardless
  // of whether a scroll-lock is active.
  React.useEffect(() => {
    const el = internalRef.current
    if (!el) {
      return
    }
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollHeight <= el.clientHeight) {
        return
      }
      e.preventDefault()
      el.scrollTop += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  return (
    <CommandPrimitive.List
      ref={mergedRef}
      data-slot="command-list"
      className={cn(
        'max-h-[min(400px,60vh)] overflow-y-auto overflow-x-hidden scrollbar-sleek scroll-pb-4 scroll-pt-4 [&>[cmdk-list-sizer]:has(>[cmdk-item])]:p-1',
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
}
