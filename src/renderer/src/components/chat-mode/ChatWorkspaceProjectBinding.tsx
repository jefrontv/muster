// The workspace dialog's ActiveCollab project picker. Binding a project makes
// task pickers and new threads in this workspace default to it. Hidden until
// ActiveCollab is connected — an empty dropdown teaches nothing.

import { ChevronDown, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import type { ActiveCollabProject } from '../../../../shared/activecollab-types'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import { useAppStore } from '@/store'

export type ChatWorkspaceProjectRef = { id: number; name: string }

export function ChatWorkspaceProjectBinding({
  value,
  onChange
}: {
  value: ChatWorkspaceProjectRef | null
  onChange: (next: ChatWorkspaceProjectRef | null) => void
}): React.JSX.Element | null {
  const connected = useAppStore((s) => s.activeCollabStatus.configured)
  const [projects, setProjects] = useState<ActiveCollabProject[] | null>(null)

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

  if (!connected) {
    return null
  }

  return (
    <div className="space-y-1.5 border-t border-border pt-3">
      <Label>
        {translate('auto.components.chat.workspaceDialog.acProject', 'ActiveCollab project')}
      </Label>
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-0 justify-between gap-1.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <ActiveCollabIcon className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">
                  {value?.name ||
                    translate('auto.components.chat.workspaceDialog.acProjectNone', 'No project')}
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
            {(projects ?? []).map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={() => onChange({ id: project.id, name: project.name })}
              >
                <span className="min-w-0 truncate">{project.name}</span>
                {project.openTaskCount !== null && project.openTaskCount > 0 ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {project.openTaskCount}
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
            {projects !== null && projects.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {translate(
                  'auto.components.chat.workspaceDialog.acProjectEmpty',
                  'No open projects found.'
                )}
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {value ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.chat.workspaceDialog.acProjectClear',
              'Unlink project'
            )}
            onClick={() => onChange(null)}
          >
            <X className="size-3" />
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.chat.workspaceDialog.acProjectHint',
          'Task pickers and new chats in this workspace default to the linked project.'
        )}
      </p>
    </div>
  )
}
