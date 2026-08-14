// Shared ActiveCollab project Command list. Workspace binding and the Tasks
// header search both render this so filter + row chrome stay identical.

import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { ActiveCollabProject } from '../../../shared/activecollab-types'
import type { ActiveCollabResult } from '../../../shared/activecollab-api-types'
import { CommandEmpty, CommandItem, CommandList } from '@/components/ui/command'
import { translate } from '@/i18n/i18n'

export type ActiveCollabProjectPick = { id: number; name: string }

export function openActiveCollabProjects(
  projects: readonly ActiveCollabProject[] | null,
  excludedIds?: ReadonlySet<number>
): ActiveCollabProject[] {
  return (projects ?? []).filter(
    (project) => !project.isCompleted && !(excludedIds?.has(project.id) ?? false)
  )
}

export function useActiveCollabProjectCatalog(enabled: boolean): {
  projects: ActiveCollabProject[] | null
} {
  const [projects, setProjects] = useState<ActiveCollabProject[] | null>(null)

  useEffect(() => {
    if (!enabled || projects !== null) {
      return
    }
    let cancelled = false
    void window.api.activecollab
      .listProjects()
      .then((result: ActiveCollabResult<ActiveCollabProject[]>) => {
        if (!cancelled && result.ok) {
          setProjects(result.value)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, projects])

  return { projects }
}

export function ActiveCollabProjectCommandList({
  projects,
  excludedIds,
  onSelect
}: {
  projects: ActiveCollabProject[] | null
  excludedIds?: ReadonlySet<number>
  onSelect: (project: ActiveCollabProjectPick) => void
}): React.JSX.Element {
  const available = useMemo(
    () => openActiveCollabProjects(projects, excludedIds),
    [excludedIds, projects]
  )

  return (
    <CommandList className="max-h-72">
      <CommandEmpty>
        {projects === null
          ? translate('auto.components.chat.workspaceDialog.acProjectLoading', 'Loading projects…')
          : translate(
              'auto.components.chat.workspaceDialog.acProjectEmpty',
              'No matching projects.'
            )}
      </CommandEmpty>
      {available.map((project) => (
        <CommandItem
          key={project.id}
          value={`${project.name} ${project.id}`}
          onSelect={() => onSelect({ id: project.id, name: project.name })}
        >
          <span className="min-w-0 truncate">{project.name}</span>
          {project.openTaskCount !== null && project.openTaskCount > 0 ? (
            <span className="ml-auto text-xs text-muted-foreground">{project.openTaskCount}</span>
          ) : null}
        </CommandItem>
      ))}
    </CommandList>
  )
}
