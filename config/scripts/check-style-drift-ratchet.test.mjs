import { describe, expect, it } from 'vitest'
import { RULES, countMatches } from './check-style-drift-ratchet.mjs'

const [faded, hover, roundIcon, uppercaseLabel] = RULES

describe('style drift ratchets', () => {
  it('counts faded muted text but not the full token or stronger alphas', () => {
    const source = `cn('text-muted-foreground/60', 'hover:text-muted-foreground/40', 'text-muted-foreground/[0.5]', 'text-muted-foreground', 'text-muted-foreground/80', 'text-muted-foreground/[0.9]', 'text-muted-foreground/100', 'text-muted-foreground/10')`
    expect(countMatches(source, faded.pattern)).toBe(5)
  })

  it('counts hover fills outside the two recipes', () => {
    const source = `cn('hover:bg-accent', 'hover:bg-foreground/[0.07]', 'hover:bg-transparent', 'hover:bg-muted/50', 'hover:bg-accent/40', 'dark:hover:bg-foreground/[0.05]')`
    expect(countMatches(source, hover.pattern)).toBe(3)
  })

  it('counts hand-built round icon buttons in either class order', () => {
    const source = `<button className="rounded-full p-1 hover:bg-accent" /><button className="p-1 text-muted-foreground rounded-full" /><span className="rounded-full p-1.5" /><span className="rounded-full sm:p-1" /><span className="rounded-full" title="p-1" />`
    expect(countMatches(source, roundIcon.pattern)).toBe(2)
  })

  it('counts uppercase tracking-wide labels but not tracking-wider or the recipe', () => {
    const source = `cn('text-[11px] uppercase tracking-wide', 'tracking-wide font-medium uppercase', 'uppercase tracking-wider', 'uppercase tracking-[0.05em]', 'tracking-wide')`
    expect(countMatches(source, uppercaseLabel.pattern)).toBe(2)
  })
})
