import { describe, expect, it } from 'vitest'
import { TAB_PILL_CLASSES, TAB_UNREAD_FILL_CLASSES, getTabStateClasses } from './tab-state-classes'

describe('tab state classes', () => {
  it('shapes every tab as a 24px pill with a visible focus ring', () => {
    expect(TAB_PILL_CLASSES).toContain('h-6')
    expect(TAB_PILL_CLASSES).toContain('rounded-full')
    expect(TAB_PILL_CLASSES).toContain('focus-visible:ring-2')
    expect(TAB_PILL_CLASSES).not.toMatch(/border-[trb]/)
  })

  it('fills the active tab with the selected right sidebar tab fill', () => {
    expect(getTabStateClasses(true)).toBe('bg-foreground/[0.1] text-foreground')
  })

  it('gives inactive tabs the control hover and no resting fill', () => {
    const classes = getTabStateClasses(false)
    expect(classes).toContain('hover:bg-foreground/[0.07]')
    expect(classes).toContain('text-muted-foreground')
    expect(classes).not.toContain('bg-card')
  })

  it('clips the unread wash to the pill', () => {
    expect(TAB_UNREAD_FILL_CLASSES).toContain('rounded-full')
    expect(TAB_UNREAD_FILL_CLASSES).toContain('bg-status-attention-background')
  })
})
