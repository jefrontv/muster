// Composer button that inserts an ActiveCollab task reference (`AC#77 `) into
// the draft. A Command-in-Popover picker (searchable single choice, per the
// styleguide) lists assigned open tasks grouped by project; a workspace's bound
// project groups first. The inserted token renders as a chip once sent.

import { LoaderCircle } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { useAppStore } from '@/store'

type ProjectGroup = { projectId: number; projectName: string; tasks: ActiveCollabTask[] }

/** Open tasks bucketed by project, the bound workspace project first. */
export function groupTasksByProject(
  tasks: ActiveCollabTask[],
  preferredProjectId: number | null
): ProjectGroup[] {
  const groups = new Map<number, ProjectGroup>()
  for (const task of tasks) {
    if (task.isCompleted) {
      continue
    }
    const group = groups.get(task.projectId) ?? {
      projectId: task.projectId,
      projectName: task.projectName,
      tasks: []
    }
    group.tasks.push(task)
    groups.set(task.projectId, group)
  }
  return [...groups.values()].sort((a, b) => {
    const aPreferred = a.projectId === preferredProjectId ? 0 : 1
    const bPreferred = b.projectId === preferredProjectId ? 0 : 1
    return aPreferred - bPreferred || a.projectName.localeCompare(b.projectName)
  })
}

export function NativeChatTaskPickerMenu({
  onInsertTaskRef,
  preferredProjectId = null
}: {
  /** Insert `AC#<id> ` at the caret; the composer owns draft/caret state. */
  onInsertTaskRef: (taskId: number) => void
  /** The workspace's bound AC project — its tasks group first. */
  preferredProjectId?: number | null
}): React.JSX.Element | null {
  const configured = useAppStore((s) => s.activeCollabStatus.configured)
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<ActiveCollabTask[] | null>(null)

  if (!configured) {
    return null
  }

  const label = translate(
    'auto.components.native-chat.taskPicker.label',
    'Reference an ActiveCollab task'
  )

  // Refresh on every open; keep the previous list while the fetch is in flight
  // so a reopen doesn't flash a spinner over data we already had.
  const loadTasks = (): void => {
    void window.api.activecollab
      .listAssignedTasks()
      .then((result) => {
        if (result.ok) {
          setTasks(result.value.tasks)
        }
      })
      .catch(() => undefined)
  }

  const groups = groupTasksByProject(tasks ?? [], preferredProjectId)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          loadTasks()
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              className="pointer-coarse:size-11"
            >
              <ActiveCollabIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="start" side="top" sideOffset={8} className="w-96 p-0">
        <Command>
          <CommandInput
            placeholder={translate(
              'auto.components.native-chat.taskPicker.search',
              'Search your open tasks…'
            )}
          />
          <CommandList className="max-h-72 scrollbar-sleek">
            {tasks === null ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                {translate('auto.components.native-chat.taskPicker.loading', 'Loading tasks…')}
              </div>
            ) : (
              <CommandEmpty>
                {translate(
                  'auto.components.native-chat.taskPicker.empty',
                  'No matching open tasks.'
                )}
              </CommandEmpty>
            )}
            {groups.map((group) => (
              <CommandGroup key={group.projectId} heading={group.projectName}>
                {group.tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={`${task.name} ${task.id}`}
                    onSelect={() => {
                      onInsertTaskRef(task.id)
                      setOpen(false)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{task.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                      #{task.id}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
