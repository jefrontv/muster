import { describe, expect, it } from 'vitest'

import {
  activeCollabDueDateFromInput,
  formatActiveCollabDueDate
} from './activecollab-task-due-date'

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

describe('formatActiveCollabDueDate', () => {
  it('keeps the local calendar day instead of re-projecting it through UTC', () => {
    // `dueOn` is already re-anchored by the main codec: this instant IS local midnight on the 27th
    // in Sydney, though UTC still calls it the 26th. Reading it as UTC would lose a day.
    const iso = withTimeZone(
      'Australia/Sydney',
      () => formatActiveCollabDueDate(Date.parse('2026-07-26T14:00:00Z'))?.iso
    )

    expect(iso).toBe('2026-07-27')
  })

  it('round-trips a picked day back to the same epoch in any zone', () => {
    for (const zone of ['Australia/Sydney', 'America/Los_Angeles', 'UTC']) {
      withTimeZone(zone, () => {
        const picked = activeCollabDueDateFromInput('2026-07-27')
        expect(picked).toBe(new Date(2026, 6, 27).getTime())
        expect(formatActiveCollabDueDate(picked)?.iso).toBe('2026-07-27')
      })
    }
  })

  it('labels the same day it formats', () => {
    const due = formatActiveCollabDueDate(new Date(2026, 6, 27).getTime())

    expect(due?.iso).toBe('2026-07-27')
    expect(due?.label).toBe(
      new Date(2026, 6, 27).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    )
  })

  it('has no due date for an unset or nonsense value', () => {
    expect(formatActiveCollabDueDate(null)).toBeNull()
    expect(formatActiveCollabDueDate(Number.NaN)).toBeNull()
    expect(formatActiveCollabDueDate(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('activeCollabDueDateFromInput', () => {
  it('treats a cleared field as no date rather than a bad date', () => {
    expect(activeCollabDueDateFromInput('')).toBeNull()
    expect(activeCollabDueDateFromInput('   ')).toBeNull()
  })

  it('rejects a calendar overflow instead of silently rolling it forward', () => {
    // `new Date(2026, 1, 31)` is March 3rd; accepting it would write a day the user never picked.
    expect(activeCollabDueDateFromInput('2026-02-31')).toBeNull()
  })

  it('rejects a partial or malformed value', () => {
    expect(activeCollabDueDateFromInput('2026-07')).toBeNull()
    expect(activeCollabDueDateFromInput('27/07/2026')).toBeNull()
  })

  it('lands on local midnight, not UTC midnight', () => {
    const picked = withTimeZone('Australia/Sydney', () =>
      activeCollabDueDateFromInput('2026-07-27')
    )

    expect(picked).toBe(withTimeZone('Australia/Sydney', () => new Date(2026, 6, 27).getTime()))
    expect(picked).not.toBe(Date.parse('2026-07-27T00:00:00Z'))
  })
})
