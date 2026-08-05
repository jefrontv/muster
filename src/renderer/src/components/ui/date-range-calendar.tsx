import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from './button'

type DateRangeCalendarProps = {
  /** Local-midnight epoch ms, or null. Without a start the end is ignored. */
  rangeStart: number | null
  rangeEnd: number | null
  /** Receives local midnight of the clicked day. */
  onPickDay: (day: number) => void
  className?: string
}

type MonthCursor = { year: number; month: number }

/**
 * Weeks of local-midnight epochs, Monday-first, padded with null outside the month. Day epochs
 * come from the local Date constructor so they land on the same calendar-day anchor the
 * ActiveCollab codec reads and writes.
 */
function monthWeeks({ year, month }: MonthCursor): (number | null)[][] {
  const days: (number | null)[] = []
  // getDay is Sunday-0; a Monday-first grid pads by the Monday-0 index instead.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  for (let i = 0; i < lead; i += 1) {
    days.push(null)
  }
  const count = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= count; day += 1) {
    days.push(new Date(year, month, day).getTime())
  }
  while (days.length % 7 !== 0) {
    days.push(null)
  }
  const weeks: (number | null)[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

// 2026-01-05 is a Monday; any known Monday-anchored week yields the localized header labels.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 0, 5 + i).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)
)

/**
 * A single-month grid for picking a day or a day range. Selection is CONTROLLED — the parent owns
 * start/end and interprets each `onPickDay` — because ordering, swapping, and commit semantics
 * belong to the feature, not the grid. Only the visible month is local state.
 */
export function DateRangeCalendar({
  rangeStart,
  rangeEnd,
  onPickDay,
  className
}: DateRangeCalendarProps): React.JSX.Element {
  const [cursor, setCursor] = React.useState<MonthCursor>(() => {
    const seed = new Date(rangeStart ?? rangeEnd ?? Date.now())
    return { year: seed.getFullYear(), month: seed.getMonth() }
  })
  const start = rangeStart
  const end = rangeStart === null ? null : (rangeEnd ?? rangeStart)
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })
  const step = (delta: number): void =>
    setCursor((current) => {
      // The Date constructor normalises month overflow, so December +1 rolls the year.
      const moved = new Date(current.year, current.month + delta, 1)
      return { year: moved.getFullYear(), month: moved.getMonth() }
    })

  return (
    <div data-slot="date-range-calendar" className={cn('w-fit select-none', className)}>
      <div className="flex items-center justify-between gap-1 pb-1.5">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate(
            'auto.components.ui.date_range_calendar.previous_month',
            'Previous month'
          )}
          onClick={() => step(-1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="text-[12px] font-medium">{monthLabel}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('auto.components.ui.date_range_calendar.next_month', 'Next month')}
          onClick={() => step(1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((label, index) => (
          <span
            key={index}
            className="pb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {monthWeeks(cursor)
          .flat()
          .map((day, index) => {
            if (day === null) {
              return <span key={index} />
            }
            const isEdge = day === start || day === end
            const inRange = start !== null && end !== null && day > start && day < end
            return (
              <button
                type="button"
                key={index}
                aria-pressed={isEdge}
                aria-label={new Date(day).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
                onClick={() => onPickDay(day)}
                className={cn(
                  'size-7 rounded-md text-[12px] tabular-nums outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring',
                  inRange && 'rounded-none bg-accent',
                  isEdge && 'bg-primary text-primary-foreground hover:bg-primary'
                )}
              >
                {new Date(day).getDate()}
              </button>
            )
          })}
      </div>
    </div>
  )
}
