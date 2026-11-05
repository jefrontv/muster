import type React from 'react'

const NEXT_KEYS: Record<'horizontal' | 'vertical', { prev: string; next: string }> = {
  horizontal: { prev: 'ArrowLeft', next: 'ArrowRight' },
  vertical: { prev: 'ArrowUp', next: 'ArrowDown' }
}

/**
 * WAI-ARIA tabs keyboard model for a role="tablist": arrows, Home and End move focus and, with
 * automatic activation, select the tab. Pair with tabIndex 0 on the selected tab, -1 elsewhere.
 * Manual activation suits tabs whose selection swaps the whole page: Enter or Space selects.
 */
export function handleTablistKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  {
    orientation = 'horizontal',
    activation = 'automatic'
  }: { orientation?: 'horizontal' | 'vertical'; activation?: 'automatic' | 'manual' } = {}
): void {
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')
  )
  const current = tabs.indexOf(document.activeElement as HTMLElement)
  if (current === -1 || tabs.length === 0) {
    return
  }
  const keys = NEXT_KEYS[orientation]
  let target: number
  if (event.key === keys.next) {
    target = (current + 1) % tabs.length
  } else if (event.key === keys.prev) {
    target = (current - 1 + tabs.length) % tabs.length
  } else if (event.key === 'Home') {
    target = 0
  } else if (event.key === 'End') {
    target = tabs.length - 1
  } else {
    return
  }
  event.preventDefault()
  tabs[target].focus()
  if (activation === 'automatic') {
    tabs[target].click()
  }
}
