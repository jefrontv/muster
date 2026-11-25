import type React from 'react'

export type TabStripFocusMove = 'next' | 'previous' | 'first' | 'last'

export function getTabStripKeyMove(key: string): TabStripFocusMove | null {
  switch (key) {
    case 'ArrowRight':
      return 'next'
    case 'ArrowLeft':
      return 'previous'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    default:
      return null
  }
}

/** Index to focus after a move; next and previous wrap. */
export function getTabStripFocusIndex(
  current: number,
  count: number,
  move: TabStripFocusMove
): number {
  if (count <= 0) {
    return -1
  }
  switch (move) {
    case 'first':
      return 0
    case 'last':
      return count - 1
    case 'next':
      return current < 0 ? 0 : (current + 1) % count
    case 'previous':
      return current < 0 ? count - 1 : (current - 1 + count) % count
  }
}

function isContextMenuKey(event: React.KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** Tablist keydown: arrows, Home and End move focus; Shift+F10 opens the focused tab's menu. */
export function handleTabStripKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
  const target = event.target as HTMLElement
  // Why: rename inputs and close buttons inside a tab keep their own keys.
  if (target.getAttribute('role') !== 'tab') {
    return
  }
  if (isContextMenuKey(event)) {
    event.preventDefault()
    const rect = target.getBoundingClientRect()
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 8,
        clientY: rect.bottom
      })
    )
    return
  }
  const move = getTabStripKeyMove(event.key)
  if (!move || event.altKey || event.ctrlKey || event.metaKey) {
    return
  }
  const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')]
  const next = tabs[getTabStripFocusIndex(tabs.indexOf(target), tabs.length, move)]
  if (!next) {
    return
  }
  event.preventDefault()
  next.focus()
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** Enter and Space on a focused tab activate it, as a click would. */
export function isTabActivationKey(event: React.KeyboardEvent): boolean {
  return (
    event.target === event.currentTarget &&
    (event.key === 'Enter' || event.key === ' ') &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  )
}
