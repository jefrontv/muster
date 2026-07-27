import { describe, expect, it } from 'vitest'
import {
  AC_DUE_BUCKETS,
  AC_DUE_NOTIFY_FLOOR,
  acDueBucketFor,
  acDueBucketPhrase,
  acDueBucketRank,
  acIsDueBucket
} from './task-due-bucket'

/** Local noon, so the day boundary is 12 hours away in either direction whatever the time zone. */
const NOW = new Date(2026, 6, 28, 12, 0, 0).getTime()

/** `dueOn` reaches the detector already anchored to LOCAL midnight (see acEpochToLocalDay). */
function localDay(year: number, monthIndex: number, day: number): number {
  return new Date(year, monthIndex, day).getTime()
}

describe('acDueBucketFor', () => {
  it('buckets the calendar days around today', () => {
    expect(acDueBucketFor(localDay(2026, 6, 27), NOW)).toBe('overdue')
    expect(acDueBucketFor(localDay(2026, 6, 28), NOW)).toBe('today')
    expect(acDueBucketFor(localDay(2026, 6, 29), NOW)).toBe('tomorrow')
    expect(acDueBucketFor(localDay(2026, 6, 30), NOW)).toBe('this-week')
    expect(acDueBucketFor(localDay(2026, 7, 4), NOW)).toBe('this-week')
    expect(acDueBucketFor(localDay(2026, 7, 5), NOW)).toBe('later')
  })

  it('reads a due date on the local calendar day it was anchored to, not a UTC projection', () => {
    // Anchored local midnight one minute after "now" crosses into tomorrow is still tomorrow, and
    // the same instant read through UTC getters would land a day either side of it west or east.
    expect(acDueBucketFor(localDay(2026, 6, 29), new Date(2026, 6, 28, 23, 59).getTime())).toBe(
      'tomorrow'
    )
    expect(acDueBucketFor(localDay(2026, 6, 29), new Date(2026, 6, 29, 0, 1).getTime())).toBe(
      'today'
    )
  })

  it('spans a DST transition without drifting a day', () => {
    // Northern-hemisphere spring forward and autumn back: whichever side the host's zone observes,
    // a date seven days out is still this-week and eight days out is still later.
    const marchNoon = new Date(2026, 2, 5, 12).getTime()
    expect(acDueBucketFor(localDay(2026, 2, 12), marchNoon)).toBe('this-week')
    expect(acDueBucketFor(localDay(2026, 2, 13), marchNoon)).toBe('later')
    const novemberNoon = new Date(2026, 9, 29, 12).getTime()
    expect(acDueBucketFor(localDay(2026, 10, 5), novemberNoon)).toBe('this-week')
    expect(acDueBucketFor(localDay(2026, 10, 6), novemberNoon)).toBe('later')
  })

  it('treats an absent due date as none', () => {
    expect(acDueBucketFor(null, NOW)).toBe('none')
    expect(acDueBucketFor(Number.NaN, NOW)).toBe('none')
  })
})

describe('bucket ordering', () => {
  it('ranks from none up to overdue so escalation is a comparison', () => {
    const ranks = AC_DUE_BUCKETS.map((bucket) => acDueBucketRank(bucket))
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right))
    expect(acDueBucketRank('overdue')).toBeGreaterThan(acDueBucketRank('today'))
    expect(acDueBucketRank('today')).toBeGreaterThan(acDueBucketRank('tomorrow'))
    expect(acDueBucketRank('tomorrow')).toBeGreaterThan(acDueBucketRank('this-week'))
    expect(acDueBucketRank('none')).toBeLessThan(acDueBucketRank('later'))
  })

  it('puts the notify floor above this-week, so a distant date is not an event', () => {
    expect(acDueBucketRank(AC_DUE_NOTIFY_FLOOR)).toBeGreaterThan(acDueBucketRank('this-week'))
    expect(acDueBucketRank(AC_DUE_NOTIFY_FLOOR)).toBeLessThanOrEqual(acDueBucketRank('today'))
  })
})

describe('acIsDueBucket', () => {
  it('accepts only the known buckets, so a hand-edited snapshot cannot smuggle one in', () => {
    expect(acIsDueBucket('overdue')).toBe(true)
    expect(acIsDueBucket('dueYesterday')).toBe(false)
    expect(acIsDueBucket(3)).toBe(false)
    expect(acIsDueBucket(undefined)).toBe(false)
  })
})

describe('acDueBucketPhrase', () => {
  it('phrases every bucket', () => {
    expect(AC_DUE_BUCKETS.map((bucket) => acDueBucketPhrase(bucket))).toEqual([
      'No due date',
      'Due later',
      'Due this week',
      'Due tomorrow',
      'Due today',
      'Overdue'
    ])
  })
})
