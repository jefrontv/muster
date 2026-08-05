import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActiveCollabTaskGroup } from './task-page-activecollab-task-grouping'
import { ActiveCollabTaskRow } from './task-page-activecollab-task-row'
import { ActiveCollabBindSiteButton } from './task-page-activecollab-bind-site-button'
import { ACTIVECOLLAB_SITE_BINDING_UI_ENABLED } from '@/lib/activecollab-site-binding-visibility'
import type { ActiveCollabTaskRef } from '../../../shared/activecollab-api-types'

/**
 * A project heading and its tasks are one unit for assistive tech: the heading names the group's
 * list through `aria-labelledby`, so entering the list announces the project instead of leaving the
 * rows as an unlabelled run. The count is decoration — the list element already reports its length,
 * and folding a bare number into the heading text would have it read as part of the project name.
 *
 * The toggle is a real <button> INSIDE the <h3> rather than a role="button" heading: that keeps the
 * heading a heading (so `aria-labelledby` still resolves to the project name) while the control
 * gets native focus, Enter/Space, and `aria-expanded` for free. The chevron affordance mirrors the
 * worktree sidebar's group headers — a ChevronDown rotated -90° when collapsed.
 */
export function ActiveCollabTaskGroupSection({
  collapsed,
  group,
  now,
  onSelect,
  onToggleCollapsed,
  onOpenProject,
  selectedTaskId
}: {
  collapsed: boolean
  group: ActiveCollabTaskGroup
  now: number
  onSelect: (ref: ActiveCollabTaskRef) => void
  onToggleCollapsed: (projectId: number) => void
  /** Present when the heading offers the project drill-in (all tasks, grouped by task list). */
  onOpenProject?: (projectId: number, projectName: string) => void
  selectedTaskId: number | null
}): React.JSX.Element {
  const headingId = `activecollab-task-group-${group.projectId}`
  const listId = `activecollab-task-group-list-${group.projectId}`
  return (
    // Why the group reads as a block: a plain `border-t` at the same weight as the row dividers
    // made a project boundary indistinguishable from a task boundary. The heading sits in its own
    // tinted band and the rows below it are divided more faintly, so the eye ranks "new project"
    // above "next task" instead of seeing one uniform stack of hairlines.
    //
    // No padding on the section: trailing space sits OUTSIDE the <ul>, so hovering the last row of
    // a group highlighted the row and then left a dead strip beneath it before the next heading,
    // which read as a broken hover. The heading's own band is the separator; it needs no help.
    <section>
      <h3
        id={headingId}
        className="sticky top-0 z-10 border-y border-border/60 bg-muted/80 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground backdrop-blur-sm"
      >
        {/* The bind control is a sibling of the toggle, not a child: nesting a button inside the
            row-wide toggle is invalid markup and unreachable by keyboard. `w-full` moves to this
            wrapper so the toggle can still own the whole row minus the control. */}
        <span className="flex w-full items-center gap-1 pr-2">
          <button
            type="button"
            aria-controls={listId}
            aria-expanded={!collapsed}
            onClick={() => onToggleCollapsed(group.projectId)}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left uppercase tracking-[inherit] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate">{group.projectName}</span>
            {/* The count survives collapse — hiding the size of what you just folded away is the one
                thing that would make collapsing worse than scrolling. */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums"
              >
                {group.tasks.length}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')}
              />
            </span>
          </button>
          {onOpenProject ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={translate(
                    'auto.components.activecollab.task_list.open_project',
                    'View all tasks in {{project}}',
                    { project: group.projectName }
                  )}
                  onClick={() => onOpenProject(group.projectId, group.projectName)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate(
                  'auto.components.activecollab.task_list.open_project_tooltip',
                  'View all project tasks'
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {ACTIVECOLLAB_SITE_BINDING_UI_ENABLED ? (
            <ActiveCollabBindSiteButton
              projectId={group.projectId}
              projectName={group.projectName}
            />
          ) : null}
        </span>
      </h3>
      {/* Stays mounted while collapsed so `aria-controls` always resolves; `hidden` (not an unmount)
          is what removes it from the a11y tree, and dropping the children keeps the rows off the
          render path. */}
      <ul
        aria-labelledby={headingId}
        className="divide-y divide-border/30"
        hidden={collapsed}
        id={listId}
      >
        {collapsed
          ? null
          : group.tasks.map((task) => (
              <ActiveCollabTaskRow
                key={task.id}
                now={now}
                onSelect={onSelect}
                selected={task.id === selectedTaskId}
                task={task}
              />
            ))}
      </ul>
    </section>
  )
}
