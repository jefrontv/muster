import { describe, expect, it } from 'vitest'
import { findViolations } from './check-ui-primitives.mjs'

const FILE = 'src/renderer/src/components/Example.tsx'

describe('check-ui-primitives', () => {
  it('flags a hand-rolled switch but accepts one built on the primitive', () => {
    expect(findViolations(FILE, '<button role="switch" aria-checked={on} />')).toHaveLength(1)
    const withTrack = `import { SwitchTrack } from '@/components/ui/switch'\n<button role="switch"><SwitchTrack checked /></button>`
    expect(findViolations(FILE, withTrack)).toEqual([])
  })

  it('ignores role="switch" inside a CSS selector string', () => {
    expect(findViolations(FILE, `const s = '[role="switch"]'`)).toEqual([])
  })

  it('flags square buttons but not other square elements', () => {
    expect(findViolations(FILE, '<button className="rounded-sm px-2">x</button>')).toHaveLength(1)
    expect(findViolations(FILE, '<span className="rounded-sm">x</span>')).toEqual([])
    expect(findViolations(FILE, '<Button className="focus-visible:rounded-sm" />')).toEqual([])
  })

  it('flags elevation shadows but allows inset strokes and hairline rings', () => {
    expect(findViolations(FILE, `'shadow-[0_6px_18px_rgba(0,0,0,0.2)]'`)).toHaveLength(1)
    expect(findViolations(FILE, `'dark:shadow-[0_6px_16px_black]'`)).toHaveLength(1)
    expect(findViolations(FILE, `'shadow-[inset_0_0_0_1px_var(--border)]'`)).toEqual([])
    expect(findViolations(FILE, `'shadow-[0_0_0_2px_var(--ring)]'`)).toEqual([])
  })
})
