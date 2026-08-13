// The workspace dialog's ActiveCollab project list. Same shape as websites /
// emails: rows plus Add. Hidden until ActiveCollab is connected.

import { Plus, X } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActiveCollabProject } from '../../../../shared/activecollab-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
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
  const [projects, setProjects] = useState<ActiveCollabProject[] | null>(null)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!connected || projects !== null) {
      return
    }
    let cancelled = false
    void window.api.activecollab
      .listProjects()
      .then((result) => {
        if (!cancelled && result.ok) {
          setProjects(result.value.filter((project) => !project.isCompleted))
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [connected, projects])

  const available = useMemo(() => {
    const taken = new Set(value.map((item) => item.id))
    return (projects ?? []).filter((project) => !taken.has(project.id))
  }, [projects, value])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
  }, [])

  if (!connected) {
    return null
  }

  return (
    <div className="space-y-2">
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
          <Button variant="outline" size="sm" className="gap-1.5" disabled={available.length === 0}>
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
            <CommandList className="max-h-72">
              <CommandEmpty>
                {projects === null
                  ? translate(
                      'auto.components.chat.workspaceDialog.acProjectLoading',
                      'Loading projects…'
                    )
                  : translate(
                      'auto.components.chat.workspaceDialog.acProjectEmpty',
                      'No matching projects.'
                    )}
              </CommandEmpty>
              {available.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`${project.name} ${project.id}`}
                  onSelect={() => {
                    onChange([...value, { id: project.id, name: project.name }])
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 truncate">{project.name}</span>
                  {project.openTaskCount !== null && project.openTaskCount > 0 ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {project.openTaskCount}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
