// The scrolling body of My Work: project sections, plus the list's roving keyboard navigation.
//
// Navigation moves REAL focus between the row buttons rather than painting a synthetic highlight —
// the rows are already focusable controls, so ↑/↓ only has to relocate focus and Enter/Space are
// then the browser's own activation. Nothing here tracks a "focused index": the DOM already knows,
// and a mirrored index goes stale the moment a refetch, a filter, or a collapse changes the rows.

import React, { useCallback, useRef } from 'react'

import type { ActiveCollabTaskRef } from '../../../shared/activecollab-api-types'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import { activeCollabGroupCollapseKey } from './task-page-activecollab-group-collapse'
import { ActiveCollabTaskGroupSection } from './task-page-activecollab-task-group-section'
import { groupActiveCollabTasksByProject } from './task-page-activecollab-task-grouping'

/** Collapsed sections drop their children, so every row this finds is one the user can see. */
const ROW_BUTTON_SELECTOR = 'li > button:first-of-type'

export function ActiveCollabMyWorkRows({
  collapsedGroups,
  label,
  now,
  onClearFilter,
  onOpenProject,
  onSelect,
  onToggleGroupCollapsed,
  selectedTaskId,
  tasks
}: {
  collapsedGroups: ReadonlySet<string>
  label: string
  now: number
  /** Present only while a filter is narrowing the list, which is what makes Escape meaningful. */
  onClearFilter?: () => void
  onOpenProject?: (projectId: number, projectName: string) => void
  onSelect: (ref: ActiveCollabTaskRef) => void
  onToggleGroupCollapsed: (projectId: number) => void
  selectedTaskId: number | null
  tasks: readonly ActiveCollabTask[]
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const groups = groupActiveCollabTasksByProject(tasks)

  const moveFocus = useCallback((delta: number): boolean => {
    const container = containerRef.current
    if (!container) {
      return false
    }
    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>(ROW_BUTTON_SELECTOR))
    if (rows.length === 0) {
      return false
    }
    const current = rows.indexOf(document.activeElement as HTMLButtonElement)
    // Entering from a heading or the filter bar starts at the end the user is travelling towards,
    // so one press lands on a row instead of being swallowed establishing a position.
    const next = current === -1 ? (delta > 0 ? 0 : rows.length - 1) : current + delta
    if (next < 0 || next >= rows.length) {
      return false
    }
    rows[next].focus()
    return true
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape' && onClearFilter) {
        event.preventDefault()
        onClearFilter()
        return
      }
      // Bare arrows: no platform modifier to branch on, and none is wanted — a list that needed a
      // chord to walk it would be slower than the scrollbar.
      const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (delta === 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }
      // Only swallow the key once focus actually moved, so an arrow at either end still scrolls.
      if (moveFocus(delta)) {
        event.preventDefault()
      }
    },
    [moveFocus, onClearFilter]
  )

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={label}
      className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto"
      onKeyDown={handleKeyDown}
    >
      {groups.map((group) => (
        <ActiveCollabTaskGroupSection
          key={group.projectId}
          collapsed={collapsedGroups.has(activeCollabGroupCollapseKey(group.projectId))}
          group={group}
          now={now}
          onSelect={onSelect}
          onToggleCollapsed={onToggleGroupCollapsed}
          onOpenProject={onOpenProject}
          selectedTaskId={selectedTaskId}
        />
      ))}
    </div>
  )
}
