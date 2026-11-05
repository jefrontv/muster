import { describe, expect, it } from 'vitest'
import { countRawStatusClasses, diffCounts, parseBaseline } from './check-raw-status-palette.mjs'

describe('raw status palette ratchet', () => {
  it('counts raw status hues with variants and alpha, not tokens or other hues', () => {
    const source = `cn('text-emerald-600 dark:text-emerald-400', 'hover:bg-rose-500/10', 'border-t-amber-500/70', 'text-status-success', 'bg-violet-500', 'emerald-500')`
    expect(countRawStatusClasses(source)).toBe(4)
  })

  it('fails growth and new files, and asks for the baseline to drop when a file improves', () => {
    const baseline = parseBaseline('a.tsx 3\nb.tsx 2\n')
    const current = new Map([
      ['a.tsx', 4],
      ['b.tsx', 1],
      ['c.tsx', 1]
    ])
    const { grew, shrank } = diffCounts(current, baseline)
    expect(grew.map((g) => g.file)).toEqual(['a.tsx', 'c.tsx'])
    expect(shrank.map((s) => s.file)).toEqual(['b.tsx'])
  })
})
