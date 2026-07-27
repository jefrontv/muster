// Picks the ActiveCollab project for ONE named Muster project.
//
// Opened from that project's ⋯ menu in the sidebar, so the target arrives as a project id in
// `modalData` and is stated in the dialog's own copy. It shares `useActiveCollabProjectBinding`
// with the Tasks bar, so the write, the rename write-back and the status model cannot drift
// between the two entry points.
//
// A dialog rather than a submenu because the picker is a search field over ~60 projects: a popover
// nested inside an open dropdown dismisses the dropdown, and a menu that long is a scroll-hunt.
import React, { useCallback, useEffect, useRef } from 'react'

import { ActiveCollabProjectPickerList } from '@/components/activecollab-project-binding-picker'
import { activeCollabBindingDisplayName } from '@/components/activecollab-project-binding-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useActiveCollabProjectBinding } from '@/hooks/useActiveCollabProjectBinding'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActiveCollabProject } from '../../../../shared/activecollab-types'

export default function ActiveCollabBindProjectDialog(): React.JSX.Element | null {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const projects = useAppStore((s) => s.projects)

  const isOpen = activeModal === 'activecollab-bind-project'
  const projectId = typeof modalData.projectId === 'string' ? modalData.projectId : ''
  const project = projects.find((candidate) => candidate.id === projectId) ?? null
  const {
    status,
    projects: instanceProjects,
    projectsLoading,
    projectsError,
    ensureProjects,
    bind
  } = useActiveCollabProjectBinding(project)

  // One-shot: `ensureProjects` retries after a failure by design, so an effect that re-ran on its
  // changing identity would loop on a broken instance. Recovery is the retry button below.
  const requestedRef = useRef(false)
  useEffect(() => {
    if (!isOpen || requestedRef.current) {
      return
    }
    requestedRef.current = true
    ensureProjects()
  }, [ensureProjects, isOpen])

  const handleSelect = useCallback(
    (instanceProject: ActiveCollabProject) => {
      bind(instanceProject)
      closeModal()
    },
    [bind, closeModal]
  )

  if (!isOpen || !project) {
    return null
  }

  const boundName = activeCollabBindingDisplayName(status)

  return (
    <Dialog open onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.activecollab_binding.dialog_title',
              'Bind an ActiveCollab project'
            )}
          </DialogTitle>
          <DialogDescription>
            {boundName
              ? translate(
                  'auto.components.sidebar.activecollab_binding.dialog_bound',
                  '{{value0}} currently shows tasks from {{value1}}. Pick a different project to move it.',
                  { value0: project.displayName, value1: boundName }
                )
              : translate(
                  'auto.components.sidebar.activecollab_binding.dialog_unbound',
                  'Tasks shown for {{value0}} will be narrowed to the project you pick.',
                  { value0: project.displayName }
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-md border border-border">
          <ActiveCollabProjectPickerList
            projects={instanceProjects}
            loading={projectsLoading}
            errorMessage={projectsError}
            selectedProjectId={status.kind === 'unbound' ? null : status.binding.projectId}
            autoFocusInput
            onSelect={handleSelect}
          />
        </div>

        {projectsError ? (
          <Button type="button" variant="outline" size="sm" onClick={ensureProjects}>
            {translate('auto.components.sidebar.activecollab_binding.retry', 'Try again')}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
