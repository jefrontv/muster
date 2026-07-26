import { describe, expect, it } from 'vitest'
import { acDateForWrite, acEpochToLocalDay, acLabelNames, acLabels, acNullableId } from './codecs'

// 2026-07-27T00:00:00Z — a real `due_on` from the target instance, and like
// every other one it is exactly UTC midnight.
const UTC_MIDNIGHT = 1785110400

// Zones are pinned per assertion because the whole point of acEpochToLocalDay
// is that its output depends on the local zone. Node applies a TZ change to the
// date cache on assignment, which the first test below verifies before the
// fixtures lean on it.
const ORIGINAL_TZ = process.env.TZ

function withTimeZone<T>(timeZone: string, run: () => T): T {
  process.env.TZ = timeZone
  try {
    return run()
  } finally {
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = ORIGINAL_TZ
    }
  }
}

/** The broken read this codec exists to prevent, kept so the drift is provable. */
function naiveEpochToLocalDay(epochSeconds: number): number {
  const local = new Date(epochSeconds * 1000)
  local.setHours(0, 0, 0, 0)
  return local.getTime()
}

describe('acEpochToLocalDay', () => {
  it('pins the process time zone, which every fixture below depends on', () => {
    expect(
      withTimeZone('America/Los_Angeles', () => new Date(UTC_MIDNIGHT * 1000).getHours())
    ).toBe(17)
    expect(withTimeZone('Australia/Sydney', () => new Date(UTC_MIDNIGHT * 1000).getHours())).toBe(
      10
    )
  })

  it('keeps the UTC calendar day when the local zone is WEST of UTC', () => {
    // Los Angeles sees 2026-07-26 17:00 for this instant, so a naive local read
    // reports the due date a day early. Expect local midnight on the 27th,
    // which is 07:00Z during PDT.
    expect(withTimeZone('America/Los_Angeles', () => acEpochToLocalDay(UTC_MIDNIGHT))).toBe(
      Date.parse('2026-07-27T07:00:00Z')
    )
  })

  it('keeps the UTC calendar day east of UTC (control: this zone never drifts)', () => {
    // Sydney is +10, so the naive read already lands on the 27th here. This case
    // is a control, not the regression guard.
    expect(withTimeZone('Australia/Sydney', () => acEpochToLocalDay(UTC_MIDNIGHT))).toBe(
      Date.parse('2026-07-26T14:00:00Z')
    )
  })

  it('differs from the naive read only west of UTC', () => {
    expect(withTimeZone('America/Los_Angeles', () => naiveEpochToLocalDay(UTC_MIDNIGHT))).not.toBe(
      withTimeZone('America/Los_Angeles', () => acEpochToLocalDay(UTC_MIDNIGHT))
    )
    expect(withTimeZone('Australia/Sydney', () => naiveEpochToLocalDay(UTC_MIDNIGHT))).toBe(
      withTimeZone('Australia/Sydney', () => acEpochToLocalDay(UTC_MIDNIGHT))
    )
  })

  it('treats null, undefined, 0 and NaN as unset', () => {
    expect(acEpochToLocalDay(null)).toBeNull()
    expect(acEpochToLocalDay(undefined)).toBeNull()
    expect(acEpochToLocalDay(0)).toBeNull()
    expect(acEpochToLocalDay(Number.NaN)).toBeNull()
    expect(acEpochToLocalDay(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('acDateForWrite', () => {
  it('emits the LOCAL calendar day, so the same day survives either zone', () => {
    // Both instants are local midnight on 2026-07-27 in their own zone, and
    // both must therefore write the 27th — despite falling on different UTC days.
    expect(
      withTimeZone('America/Los_Angeles', () => acDateForWrite(Date.parse('2026-07-27T07:00:00Z')))
    ).toBe('2026-07-27')
    expect(
      withTimeZone('Australia/Sydney', () => acDateForWrite(Date.parse('2026-07-26T14:00:00Z')))
    ).toBe('2026-07-27')
  })

  it('reads the local day, not the UTC day, for a mid-day instant', () => {
    // 2026-07-27T02:00Z is still the 26th in Los Angeles; writing the UTC day
    // here is the same off-by-one in the opposite direction.
    expect(
      withTimeZone('America/Los_Angeles', () => acDateForWrite(Date.parse('2026-07-27T02:00:00Z')))
    ).toBe('2026-07-26')
  })

  it('pads month and day', () => {
    expect(withTimeZone('UTC', () => acDateForWrite(Date.parse('2026-01-05T00:00:00Z')))).toBe(
      '2026-01-05'
    )
  })

  it('passes null through, because null CLEARS the field upstream', () => {
    expect(acDateForWrite(null)).toBeNull()
    expect(acDateForWrite(Number.NaN)).toBeNull()
  })
})

describe('date round trip', () => {
  for (const timeZone of ['America/Los_Angeles', 'Australia/Sydney', 'UTC']) {
    it(`survives epoch -> write string -> epoch in ${timeZone}`, () => {
      const written = withTimeZone(timeZone, () => acDateForWrite(acEpochToLocalDay(UTC_MIDNIGHT)))
      expect(written).toBe('2026-07-27')
      expect(Date.parse(`${written}T00:00:00Z`)).toBe(UTC_MIDNIGHT * 1000)
    })
  }
})

describe('acNullableId', () => {
  it('maps the 0 sentinel, negatives and non-integers to null', () => {
    expect(acNullableId(0)).toBeNull()
    expect(acNullableId(-1)).toBeNull()
    expect(acNullableId(1.5)).toBeNull()
    expect(acNullableId(Number.NaN)).toBeNull()
    expect(acNullableId('12')).toBeNull()
    expect(acNullableId(null)).toBeNull()
    expect(acNullableId(undefined)).toBeNull()
  })

  it('keeps a real id', () => {
    expect(acNullableId(12)).toBe(12)
  })
})

describe('acLabels', () => {
  it('reads label objects, tolerating a string or int position', () => {
    expect(
      acLabels([
        { id: 7, name: 'Urgent', color: '#FF0000', position: '3' },
        { id: 9, name: 'Backend', color: '#00FF00', position: 1 }
      ])
    ).toEqual([
      { id: 7, name: 'Urgent', color: '#FF0000' },
      { id: 9, name: 'Backend', color: '#00FF00' }
    ])
  })

  it('reads bare name strings, which some endpoints return instead', () => {
    expect(acLabels(['Urgent', '  Backend  '])).toEqual([
      { id: 0, name: 'Urgent', color: null },
      { id: 0, name: 'Backend', color: null }
    ])
  })

  it('reports a missing or blank colour as null', () => {
    expect(
      acLabels([
        { id: 7, name: 'Urgent' },
        { id: 8, name: 'Later', color: '   ' }
      ])
    ).toEqual([
      { id: 7, name: 'Urgent', color: null },
      { id: 8, name: 'Later', color: null }
    ])
  })

  it('maps the 0 id sentinel to 0 rather than inventing one', () => {
    expect(acLabels([{ id: 0, name: 'Urgent' }])).toEqual([{ id: 0, name: 'Urgent', color: null }])
  })

  it('drops entries with no usable name', () => {
    expect(
      acLabels([null, 42, '', '   ', {}, { id: 1 }, { id: 2, name: '  ' }, { name: 5 }, ['x']])
    ).toEqual([])
  })

  it('returns an empty list for a non-array', () => {
    expect(acLabels(undefined)).toEqual([])
    expect(acLabels(null)).toEqual([])
    expect(acLabels({ id: 1, name: 'Urgent' })).toEqual([])
  })
})

describe('acLabelNames', () => {
  it('flattens to the bare names a write expects', () => {
    expect(
      acLabelNames([
        { id: 7, name: 'Urgent', color: '#FF0000' },
        { id: 0, name: 'Backend', color: null }
      ])
    ).toEqual(['Urgent', 'Backend'])
  })
})
