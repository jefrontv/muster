import { describe, expect, it } from 'vitest'
import { RULES, countMatches } from './check-style-drift-ratchet.mjs'

const [faded, hover] = RULES

describe('style drift ratchets', () => {
  it('counts faded muted text but not the full token or stronger alphas', () => {
    const source = `cn('text-muted-foreground/60', 'hover:text-muted-foreground/40', 'text-muted-foreground/[0.5]', 'text-muted-foreground', 'text-muted-foreground/80')`
    expect(countMatches(source, faded.pattern)).toBe(3)
  })

  it('counts hover fills outside the two recipes', () => {
    const source = `cn('hover:bg-accent', 'hover:bg-foreground/[0.07]', 'hover:bg-transparent', 'hover:bg-muted/50', 'hover:bg-accent/40', 'dark:hover:bg-foreground/[0.05]')`
    expect(countMatches(source, hover.pattern)).toBe(3)
  })
})
