import { describe, expect, it } from 'vitest'

import { acDateForWrite, acEpochToLocalDay } from '../../../shared/activecollab-dates'
import {
  activeCollabPickScheduleDay,
  activeCollabScheduleDraft,
  activeCollabScheduleFromDraft,
  formatActiveCollabScheduleLabel
} from './activecollab-task-schedule'

function withTimeZone<T>(timeZone: string, run: () => T): T {
  const original = process.env.TZ
  process.env.TZ = timeZone
  try {
    return run()
  } finally {
    if (original === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = original
    }
  }
}

/** Local-midnight epoch, the exact value a grid cell carries. */
function day(year: number, monthIndex: number, dayOfMonth: number): number {
  return new Date(year, monthIndex, dayOfMonth).getTime()
}

const AUG_4 = day(2026, 7, 4)
const AUG_10 = day(2026, 7, 10)
const AUG_20 = day(2026, 7, 20)

describe('activeCollabPickScheduleDay', () => {
  it('starts a range on the first click and completes it on the second', () => {
    const first = activeCollabPickScheduleDay({ start: null, end: null }, AUG_10)
    expect(first).toEqual({ start: AUG_10, end: null })

    expect(activeCollabPickScheduleDay(first, AUG_20)).toEqual({ start: AUG_10, end: AUG_20 })
  })

  it('swaps when the second click lands on an earlier day', () => {
    const swapped = activeCollabPickScheduleDay({ start: AUG_10, end: null }, AUG_4)

    expect(swapped).toEqual({ start: AUG_4, end: AUG_10 })
  })

  it('accepts the same day twice as a single-day range', () => {
    expect(activeCollabPickScheduleDay({ start: AUG_10, end: null }, AUG_10)).toEqual({
      start: AUG_10,
      end: AUG_10
    })
  })

  it('starts over when a completed range is clicked again', () => {
    expect(activeCollabPickScheduleDay({ start: AUG_4, end: AUG_10 }, AUG_20)).toEqual({
      start: AUG_20,
      end: null
    })
  })
})

describe('activeCollabScheduleDraft', () => {
  it('opens a due-only task with the due day as the single selected day', () => {
    expect(activeCollabScheduleDraft(null, AUG_10)).toEqual({ start: AUG_10, end: AUG_10 })
  })

  it('opens a stored range as-is', () => {
    expect(activeCollabScheduleDraft(AUG_4, AUG_10)).toEqual({ start: AUG_4, end: AUG_10 })
  })

  it('opens empty when nothing is set', () => {
    expect(activeCollabScheduleDraft(null, null)).toEqual({ start: null, end: null })
  })
})

describe('activeCollabScheduleFromDraft', () => {
  it('commits nothing when no day is selected', () => {
    expect(activeCollabScheduleFromDraft({ start: null, end: null })).toBeNull()
  })

  it('commits one click as a single-day range, both fields set', () => {
    expect(activeCollabScheduleFromDraft({ start: AUG_10, end: null })).toEqual({
      startOn: AUG_10,
      dueOn: AUG_10
    })
  })

  it('commits a completed range with start and due', () => {
    expect(activeCollabScheduleFromDraft({ start: AUG_4, end: AUG_10 })).toEqual({
      startOn: AUG_4,
      dueOn: AUG_10
    })
  })
})

describe('formatActiveCollabScheduleLabel', () => {
  it('renders nothing when neither date is set', () => {
    expect(formatActiveCollabScheduleLabel(null, null)).toBeNull()
  })

  it('renders a due-only task as that single date', () => {
    expect(formatActiveCollabScheduleLabel(null, AUG_10)).toBe(
      new Date(AUG_10).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    )
  })

  it('renders a range day-first as `d MMM – d MMM`', () => {
    const month = (epoch: number): string =>
      new Date(epoch).toLocaleDateString(undefined, { month: 'short' })

    expect(formatActiveCollabScheduleLabel(AUG_4, AUG_20)).toBe(
      `4 ${month(AUG_4)} – 20 ${month(AUG_20)}`
    )
  })

  it('collapses a single-day range to the plain date', () => {
    expect(formatActiveCollabScheduleLabel(AUG_10, AUG_10)).toBe(
      formatActiveCollabScheduleLabel(null, AUG_10)
    )
  })
})

describe('grid day to wire and back', () => {
  it('survives the date-only codec round-trip on the same calendar day in any zone', () => {
    for (const zone of ['Australia/Sydney', 'America/Los_Angeles', 'UTC']) {
      withTimeZone(zone, () => {
        // The exact epoch a grid cell hands the draft: local midnight of the picked day.
        const picked = day(2026, 7, 4)

        // Out as date-only, exactly what mutations.ts puts in the PUT body.
        const wire = acDateForWrite(picked)
        expect(wire).toBe('2026-08-04')

        // ActiveCollab echoes the day back as UTC midnight epoch seconds; the read codec must
        // land on the same local calendar day the user picked, in every zone.
        const echoedSeconds = Date.parse(`${wire}T00:00:00Z`) / 1000
        expect(acEpochToLocalDay(echoedSeconds)).toBe(picked)
      })
    }
  })
})
