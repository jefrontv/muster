// The workspace dialog's ActiveCollab project list. Same shape as websites /
// emails: rows plus Add. Hidden until ActiveCollab is connected.

import { Plus, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  ActiveCollabProjectCommandList,
  useActiveCollabProjectCatalog
} from '@/components/activecollab-project-picker'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Command, CommandInput } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { useAppStore } from '@/store'

export type ChatWorkspaceProjectRef = { id: number; name: string }

export function ChatWorkspaceProjectBinding({
  value,
  onChange
}: {
  value: ChatWorkspaceProjectRef[]
  onChange: (next: ChatWorkspaceProjectRef[]) => void
}): React.JSX.Element | null {
  const connected = useAppStore((s) => s.activeCollabStatus.configured)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { projects } = useActiveCollabProjectCatalog(connected)
  const takenIds = new Set(value.map((item) => item.id))
  const canAdd = (projects ?? []).some(
    (project) => !project.isCompleted && !takenIds.has(project.id)
  )

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
  }, [])

  if (!connected) {
    return null
  }

  return (
    <div className="space-y-2" data-contextual-tour-target="chat-workspace-project-binding">
      <div className="space-y-1">
        <Label>
          {translate('auto.components.chat.workspaceDialog.acProjects', 'ActiveCollab projects')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.chat.workspaceDialog.acProjectHint',
            'The first project is the default for task pickers and new chats.'
          )}
        </p>
      </div>
      {value.length > 0 ? (
        <ul className="space-y-1.5">
          {value.map((project, index) => (
            <li
              key={project.id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1"
            >
              <ActiveCollabIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
              {index === 0 ? (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {translate('auto.components.chat.workspaceDialog.primary', 'primary')}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.chat.workspaceDialog.acProjectRemove',
                  'Remove project'
                )}
                onClick={() => onChange(value.filter((item) => item.id !== project.id))}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.chat.workspaceDialog.noAcProjects',
            'No projects yet. Add the main ActiveCollab project first.'
          )}
        </p>
      )}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={projects !== null && !canAdd}
          >
            <Plus className="size-3.5" />
            {translate('auto.components.chat.workspaceDialog.addAcProject', 'Add project')}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
        >
          <Command>
            <CommandInput
              ref={inputRef}
              placeholder={translate(
                'auto.components.chat.workspaceDialog.acProjectSearch',
                'Search projects…'
              )}
            />
            <ActiveCollabProjectCommandList
              projects={projects}
              excludedIds={takenIds}
              onSelect={(project) => {
                onChange([...value, project])
                setOpen(false)
              }}
            />
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
