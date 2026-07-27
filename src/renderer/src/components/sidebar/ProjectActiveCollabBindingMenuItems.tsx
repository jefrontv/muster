// The ActiveCollab section of a sidebar project's ⋯ menu.
//
// This is where a binding is SET, because this is the only surface where the Muster project is
// unambiguous: it is the row whose menu you opened. Nothing here reads the active workspace, so
// binding a project you are not currently sitting in works and lands on the record you pointed at.
//
// Disconnected instances get the entry DISABLED WITH A REASON rather than hidden. Hiding it would
// reproduce the bug this replaces — a user who cannot find how binding is done — for exactly the
// person most likely to be hunting for it. Unbind stays live while disconnected: it is a local
// write that needs no project list.
import React, { useCallback } from 'react'
import { Link2Off } from 'lucide-react'

import { selectProjectForRepoId } from '@/components/activecollab-binding-target-project'
import { activeCollabBindingDisplayName } from '@/components/activecollab-project-binding-state'
import { ActiveCollabIcon } from '@/components/icons/ActiveCollabIcon'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { useActiveCollabProjectBinding } from '@/hooks/useActiveCollabProjectBinding'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export function ProjectActiveCollabBindingMenuItems({
  repoId
}: {
  repoId: string
}): React.JSX.Element | null {
  const projects = useAppStore((s) => s.projects)
  const settings = useAppStore((s) => s.settings)
  const activeCollabStatus = useAppStore((s) => s.activeCollabStatus)
  const activeCollabStatusContextKey = useAppStore((s) => s.activeCollabStatusContextKey)
  const openModal = useAppStore((s) => s.openModal)

  const project = selectProjectForRepoId(projects, repoId)
  // Reporting only, so no verification read: opening a project's ⋯ menu must not cost a request.
  const { status, clear } = useActiveCollabProjectBinding(project, { verifyOnMount: false })

  const handleOpenPicker = useCallback(() => {
    if (project) {
      openModal('activecollab-bind-project', { projectId: project.id })
    }
  }, [openModal, project])

  if (!project) {
    return null
  }

  const connected =
    activeCollabStatusContextKey === getProviderRuntimeContextKey(settings) &&
    activeCollabStatus.configured
  const boundName = activeCollabBindingDisplayName(status)

  return (
    <>
      <DropdownMenuSeparator />
      {boundName ? (
        <DropdownMenuLabel className="py-1 text-xs font-normal text-muted-foreground">
          <span className="block max-w-48 truncate">
            {translate(
              'auto.components.sidebar.activecollab_binding.bound_to',
              'ActiveCollab: {{value0}}',
              { value0: boundName }
            )}
          </span>
        </DropdownMenuLabel>
      ) : null}
      <DropdownMenuItem disabled={!connected} onSelect={handleOpenPicker}>
        <ActiveCollabIcon className="size-3.5" />
        {boundName
          ? translate(
              'auto.components.sidebar.activecollab_binding.change',
              'Change ActiveCollab project…'
            )
          : translate(
              'auto.components.sidebar.activecollab_binding.bind',
              'Bind ActiveCollab project…'
            )}
      </DropdownMenuItem>
      {boundName ? (
        <DropdownMenuItem onSelect={clear}>
          <Link2Off className="size-3.5" />
          {translate('auto.components.sidebar.activecollab_binding.unbind', 'Unbind from project')}
        </DropdownMenuItem>
      ) : null}
      {connected ? null : (
        <DropdownMenuLabel className="py-1 text-xs font-normal text-muted-foreground">
          {translate(
            'auto.components.sidebar.activecollab_binding.disconnected',
            'Connect ActiveCollab in Settings to pick a project.'
          )}
        </DropdownMenuLabel>
      )}
    </>
  )
}
