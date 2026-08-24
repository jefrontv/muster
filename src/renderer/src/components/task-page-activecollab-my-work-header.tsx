// The My Work header band. Split out of the list so the list keeps only its load states: the band
// carries several controls and grew past the point where inlining it read as one component.
//
// Every control is icon-xs, matching the project-jump control that was here first — a 41px band has
// room for one row height, and a taller primary button would have made the band grow instead.

import React from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { ActiveCollabTaskRef } from '../../../shared/activecollab-api-types'
import { ActiveCollabProjectSearchControl } from './task-page-activecollab-project-search'
import { ActiveCollabUpdatesBell } from './task-page-activecollab-updates-bell'

function ActiveCollabHeaderAction({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function ActiveCollabMyWorkHeader({
  count,
  onOpenCreate,
  onOpenProject,
  onSelect
}: {
  /** Null while loading or failed — a count of rows nobody can see is noise. */
  count: number | null
  onOpenCreate: () => void
  onOpenProject?: (projectId: number, projectName: string) => void
  onSelect: (ref: ActiveCollabTaskRef) => void
}): React.JSX.Element {
  return (
    <div className="flex h-[41px] items-center gap-2 border-b border-border/50 px-3 py-2">
      <span className="min-w-0 truncate text-sm font-semibold">
        {translate('auto.components.activecollab.task_list.my_work', 'My Work')}
      </span>
      {count === null ? null : (
        <span
          data-testid="activecollab-my-work-count"
          className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
        >
          {count}
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ActiveCollabHeaderAction
          icon={<Plus />}
          label={translate('auto.components.activecollab.my_work.create_task', 'New task')}
          onClick={onOpenCreate}
        />
        {onOpenProject ? (
          <ActiveCollabProjectSearchControl
            onSelect={(project) => onOpenProject(project.id, project.name)}
          />
        ) : null}
        {/* Trailing edge, after the controls that act on this list: the bell opens a read-only feed
            about the whole instance, and it is where ActiveCollab itself keeps its own. */}
        <ActiveCollabUpdatesBell onSelect={onSelect} />
      </div>
    </div>
  )
}
