// Page outline: a rail of dashes, one per heading, that opens into the list of headings on
// hover or focus. It overlays the page, so a narrow tab keeps the rail and floats the list.
import type React from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { FLOATING_SURFACE } from '../ui/menu-surface-classes'
import type { PageOutlineItem } from './project-page-outline-model'

const DASH_WIDTHS_PX = [16, 12, 9, 6]
const ROW_INDENT_PX = 12
const CLOSE_DELAY_MS = 150

type Props = {
  items: readonly PageOutlineItem[]
  activeIndex: number
  onJump: (index: number) => void
}

export function ProjectPageOutlineRail({ items, activeIndex, onJump }: Props): React.JSX.Element {
  const panelId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const open = hovered || focused
  const label = translate('auto.components.projectPages.outline.label', 'Page outline')

  const clearCloseTimer = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  useEffect(() => clearCloseTimer, [])
  useEffect(() => {
    if (open) {
      panelRef.current
        ?.querySelector<HTMLElement>('[data-current="true"]')
        ?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [open])

  const onEnter = (): void => {
    clearCloseTimer()
    setHovered(true)
  }
  const onLeave = (): void => {
    clearCloseTimer()
    closeTimer.current = window.setTimeout(() => setHovered(false), CLOSE_DELAY_MS)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const rows = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-outline-row]') ?? []
    )
    const at = rows.indexOf(document.activeElement as HTMLButtonElement)
    const from = at === -1 ? Math.max(0, activeIndex) : at
    const moves: Record<string, number> = {
      ArrowDown: at === -1 ? from : from + 1,
      ArrowUp: at === -1 ? from : from - 1,
      Home: 0,
      End: rows.length - 1
    }
    if (event.key in moves) {
      event.preventDefault()
      rows[Math.max(0, Math.min(rows.length - 1, moves[event.key]))]?.focus()
    } else if (event.key === 'Enter' && at !== -1) {
      event.preventDefault()
      onJump(at)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      clearCloseTimer()
      setHovered(false)
      ;(document.activeElement as HTMLElement | null)?.blur()
    }
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false)
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="group pointer-events-auto absolute top-1/2 right-3 flex max-h-[60%] -translate-y-1/2 flex-col items-end gap-1.5 overflow-hidden rounded-md px-1 py-2 outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
      >
        {items.map((item, index) => (
          <span
            key={item.id}
            aria-hidden
            data-current={index === activeIndex}
            className={cn(
              'block h-0.5 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
              index === activeIndex
                ? 'bg-foreground'
                : 'bg-muted-foreground/35 group-hover:bg-muted-foreground/60'
            )}
            style={{ width: DASH_WIDTHS_PX[Math.min(item.depth, DASH_WIDTHS_PX.length - 1)] }}
          />
        ))}
      </button>
      {open ? (
        <nav
          id={panelId}
          ref={panelRef}
          aria-label={label}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          className={cn(
            FLOATING_SURFACE,
            'scrollbar-sleek pointer-events-auto absolute top-1/2 right-2 flex max-h-[70%] w-60 max-w-[calc(100%-1rem)] -translate-y-1/2 flex-col gap-0.5 overflow-y-auto p-1.5 animate-in fade-in-0 motion-reduce:animate-none'
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              tabIndex={-1}
              data-outline-row
              data-current={index === activeIndex}
              onClick={() => onJump(index)}
              style={{ paddingLeft: 8 + Math.min(item.depth, 4) * ROW_INDENT_PX }}
              className="flex min-h-7 w-full shrink-0 items-center rounded-md py-1 pr-2 text-left text-[13px] leading-[18px] text-muted-foreground outline-hidden hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06] focus-visible:text-foreground data-[current=true]:bg-accent data-[current=true]:text-foreground"
            >
              <span className="truncate">{item.title}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
