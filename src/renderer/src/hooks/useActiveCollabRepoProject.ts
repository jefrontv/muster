// The ActiveCollab project bound to the workspace the user is looking at, and how to change it.
//
// Written through the renderer's own settings store, never from main. The Extension Hub learned
// that the hard way: settings written in the main process leave this side's copy stale, so a
// control snaps back to where it started and a saved value looks accepted while changing nothing.

import { useCallback } from 'react'
import { useAppStore } from '@/store'
import {
  readActiveCollabRepoProject,
  setActiveCollabRepoProject
} from '../../../shared/activecollab-repo-project-binding'

export type ActiveCollabRepoProjectBinding = {
  /** The repo the active workspace belongs to. Null when no workspace is open. */
  repoId: string | null
  projectId: number | null
  /** Null clears the binding. Refuses when there is no repo to bind it to. */
  bind: (projectId: number | null) => Promise<void>
}

export function useActiveCollabRepoProject(): ActiveCollabRepoProjectBinding {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const repoId = useAppStore((state) =>
    activeWorktreeId
      ? (state.getKnownWorktreeById(activeWorktreeId)?.repoId ?? null)
      : null
  )
  const stored = useAppStore((state) => state.settings?.activeCollabRepoProjects)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const bind = useCallback(
    async (projectId: number | null) => {
      if (!repoId) {
        return
      }
      await updateSettings({
        activeCollabRepoProjects: setActiveCollabRepoProject(stored, repoId, projectId)
      })
    },
    [repoId, stored, updateSettings]
  )

  return {
    repoId,
    projectId: readActiveCollabRepoProject({ activeCollabRepoProjects: stored }, repoId),
    bind
  }
}
