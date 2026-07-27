// The Muster project the Tasks page is currently reporting on.
//
// The Tasks page has no project of its own, so it reads the one the app is pointed at. This is the
// ONLY surface that resolves a target implicitly, and it does so to report and to pre-name its bind
// shortcut — never to decide where a write the user did not aim should land. The sidebar hands its
// target in explicitly.
import { useMemo } from 'react'

import { selectActiveCollabBindingProject } from '@/components/activecollab-binding-target-project'
import { useAppStore } from '@/store'
import type { Project } from '../../../shared/types'

export function useActiveCollabBindingTargetProject(): Project | null {
  const projects = useAppStore((s) => s.projects)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const getKnownWorktreeById = useAppStore((s) => s.getKnownWorktreeById)

  return useMemo(
    () =>
      selectActiveCollabBindingProject({
        projects,
        activeWorktree: activeWorktreeId ? getKnownWorktreeById(activeWorktreeId) : null,
        activeRepoId
      }),
    [activeRepoId, activeWorktreeId, getKnownWorktreeById, projects]
  )
}
