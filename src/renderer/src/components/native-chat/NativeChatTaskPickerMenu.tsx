// Composer button that inserts an ActiveCollab task reference (`AC#77 `) into
// the draft. Assigned open tasks load on open; a bound workspace project's
// tasks sort first. The inserted token renders as a chip once sent.

import type React from 'react'
import { useState } from 'react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { useAppStore } from '@/store'

export function NativeChatTaskPickerMenu({
  onInsertTaskRef,
  preferredProjectId = null
}: {
  /** Insert `AC#<id> ` at the caret; the composer owns draft/caret state. */
  onInsertTaskRef: (taskId: number) => void
  /** The workspace's bound AC project — its tasks list first. */
  preferredProjectId?: number | null
}): React.JSX.Element | null {
  const configured = useAppStore((s) => s.activeCollabStatus.configured)
  const [tasks, setTasks] = useState<ActiveCollabTask[] | null>(null)
  const [query, setQuery] = useState('')

  if (!configured) {
    return null
  }

  const loadTasks = (): void => {
    if (tasks !== null) {
      return
    }
    void window.api.activecollab
      .listAssignedTasks()
      .then((result) => {
        if (result.ok) {
          setTasks(result.value.tasks)
        }
      })
      .catch(() => undefined)
  }

  const lowered = query.trim().toLowerCase()
  const visible = (tasks ?? [])
    .filter(
      (task) =>
        lowered === '' ||
        task.name.toLowerCase().includes(lowered) ||
        String(task.id).includes(lowered)
    )
    .sort((a, b) => {
      const aPreferred = a.projectId === preferredProjectId ? 0 : 1
      const bPreferred = b.projectId === preferredProjectId ? 0 : 1
      return aPreferred - bPreferred
    })
    .slice(0, 30)

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          loadTasks()
          setQuery('')
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={translate(
                'auto.components.native-chat.taskPicker.label',
                'Reference an ActiveCollab task'
              )}
              className="pointer-coarse:size-11"
            >
              <ActiveCollabIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {translate(
            'auto.components.native-chat.taskPicker.label',
            'Reference an ActiveCollab task'
          )}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" side="top" className="w-80">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {translate('auto.components.native-chat.taskPicker.heading', 'Your open tasks')}
        </DropdownMenuLabel>
        <div className="px-1 pb-1">
          <Input
            value={query}
            autoFocus
            className="h-7 text-xs"
            placeholder={translate('auto.components.native-chat.taskPicker.search', 'Search…')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>
        {visible.map((task) => (
          <DropdownMenuItem key={task.id} onSelect={() => onInsertTaskRef(task.id)}>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">#{task.id}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{task.name}</span>
            {task.projectId === preferredProjectId ? (
              <ActiveCollabIcon className="size-3 shrink-0 text-muted-foreground/60" />
            ) : null}
          </DropdownMenuItem>
        ))}
        {tasks !== null && visible.length === 0 ? (
          <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">
            {translate('auto.components.native-chat.taskPicker.empty', 'No matching open tasks.')}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
