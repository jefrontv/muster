import { describe, expect, it } from 'vitest'

import { formatActiveCollabDueDate } from './activecollab-task-due-date'

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
