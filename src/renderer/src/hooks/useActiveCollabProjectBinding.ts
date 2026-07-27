// Owns the ActiveCollab project binding for whichever Muster project is currently in scope: the
// project-list read that verifies it, the write that sets or clears it, and the write-back that
// keeps the cached display name honest after an upstream rename.
//
// The project list is fetched lazily. An unbound user pays nothing until they open the picker; a
// bound one pays one request per Tasks-page visit, which is also the only way to learn that the
// bound project was renamed or is no longer visible.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { describeActiveCollabFailure } from '@/components/activecollab-failure-message'
import { selectActiveCollabBindingProject } from '@/components/activecollab-binding-target-project'
import {
  activeCollabBindingNameDrift,
  resolveActiveCollabBindingStatus,
  type ActiveCollabBindingStatus
} from '@/components/activecollab-project-binding-state'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useAppStore } from '@/store'
import type { ActiveCollabProject } from '../../../shared/activecollab-types'
import type { Project } from '../../../shared/types'

export type ActiveCollabProjectBindingController = {
  /** The Muster project a binding would attach to; null when nothing is in scope. */
  targetProject: Project | null
  status: ActiveCollabBindingStatus
  projects: readonly ActiveCollabProject[] | null
  projectsLoading: boolean
  projectsError: string | null
  ensureProjects: () => void
  bind: (project: ActiveCollabProject) => void
  clear: () => void
}

type ProjectListState = {
  projects: readonly ActiveCollabProject[] | null
  loading: boolean
  error: string | null
}

const INITIAL_PROJECT_LIST: ProjectListState = { projects: null, loading: false, error: null }

export function useActiveCollabProjectBinding(): ActiveCollabProjectBindingController {
  const projects = useAppStore((s) => s.projects)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const getKnownWorktreeById = useAppStore((s) => s.getKnownWorktreeById)
  const updateProject = useAppStore((s) => s.updateProject)
  const listActiveCollabProjects = useAppStore((s) => s.listActiveCollabProjects)
  const mountedRef = useMountedRef()

  const [projectList, setProjectList] = useState<ProjectListState>(INITIAL_PROJECT_LIST)
  // Guards the local state machine only. The slice already coalesces concurrent reads, but two
  // callers arriving in the same tick would otherwise both flip `loading` and both write back.
  const inflightRef = useRef(false)

  const targetProject = useMemo(
    () =>
      selectActiveCollabBindingProject({
        projects,
        activeWorktree: activeWorktreeId ? getKnownWorktreeById(activeWorktreeId) : null,
        activeRepoId
      }),
    [activeRepoId, activeWorktreeId, getKnownWorktreeById, projects]
  )

  const status = useMemo(
    () =>
      resolveActiveCollabBindingStatus({
        binding: targetProject?.activeCollabBinding,
        projects: projectList.projects
      }),
    [projectList.projects, targetProject?.activeCollabBinding]
  )

  const loadProjects = useCallback(async (): Promise<void> => {
    if (inflightRef.current) {
      return
    }
    inflightRef.current = true
    setProjectList((previous) => ({ ...previous, loading: true, error: null }))
    // Unforced: the slice's own short-lived cache is fresh enough to notice a rename and stops a
    // Tasks-page revisit costing a request every time.
    const result = await listActiveCollabProjects()
    inflightRef.current = false
    if (!mountedRef.current) {
      return
    }
    setProjectList((previous) => ({
      // A failed refresh keeps the rows it already had: they still name the bound project
      // correctly, and blanking them would flip a healthy binding to "no longer available".
      projects: result.ok ? result.value : previous.projects,
      loading: false,
      error: result.ok ? null : describeActiveCollabFailure(result)
    }))
  }, [listActiveCollabProjects, mountedRef])

  /** User-initiated (picker open): loads if absent, and retries a read that failed. */
  const ensureProjects = useCallback(() => {
    if (projectList.loading || (projectList.projects && !projectList.error)) {
      return
    }
    void loadProjects()
  }, [loadProjects, projectList.error, projectList.loading, projectList.projects])

  // A stored binding is unverified until the instance confirms it, so a bound project pulls the
  // list itself rather than waiting for the user to open the picker.
  //
  // One-shot by ref, NOT by inspecting the load state: a failed read leaves `projects` null, and
  // an effect that re-derives "should I load?" from that would re-fire on its own state change and
  // hammer the instance forever. Recovery from a failure is the picker's job, on user action.
  const bound = Boolean(targetProject?.activeCollabBinding)
  const verifyAttemptedRef = useRef(false)
  useEffect(() => {
    if (!bound || verifyAttemptedRef.current) {
      return
    }
    verifyAttemptedRef.current = true
    void loadProjects()
  }, [bound, loadProjects])

  // Keyed by the exact rename this attempt is for, so a failed write is not retried in a loop and a
  // later, different rename still gets one attempt.
  const attemptedRenameRef = useRef<string | null>(null)
  const targetProjectId = targetProject?.id ?? null
  useEffect(() => {
    const drift = activeCollabBindingNameDrift(status)
    if (!drift || !targetProjectId) {
      return
    }
    const attemptKey = `${targetProjectId}::${drift.projectId}::${drift.projectName}`
    if (attemptedRenameRef.current === attemptKey) {
      return
    }
    attemptedRenameRef.current = attemptKey
    void updateProject(targetProjectId, { activeCollabBinding: drift })
  }, [status, targetProjectId, updateProject])

  const bind = useCallback(
    (project: ActiveCollabProject) => {
      if (!targetProjectId) {
        return
      }
      attemptedRenameRef.current = null
      void updateProject(targetProjectId, {
        activeCollabBinding: {
          projectId: project.id,
          projectName: project.name,
          boundAt: Date.now()
        }
      })
    },
    [targetProjectId, updateProject]
  )

  const clear = useCallback(() => {
    if (!targetProjectId) {
      return
    }
    attemptedRenameRef.current = null
    void updateProject(targetProjectId, { activeCollabBinding: null })
  }, [targetProjectId, updateProject])

  return {
    targetProject,
    status,
    projects: projectList.projects,
    projectsLoading: projectList.loading,
    projectsError: projectList.error,
    ensureProjects,
    bind,
    clear
  }
}
