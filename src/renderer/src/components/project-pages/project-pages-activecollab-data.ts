// ActiveCollab rows for task and project links on pages. Reads the Tasks cache first, then the
// project lists. Never the task detail endpoint: a detail GET marks the task's updates seen.
import {
  activeCollabUrl,
  type ActiveCollabPageRef
} from '../../../../shared/project-pages-activecollab-links'
import type { ActiveCollabProject, ActiveCollabTask } from '../../../../shared/activecollab-types'
import {
  activeCollabListProjects,
  activeCollabListProjectTasks
} from '@/runtime/runtime-activecollab-client'
import { useAppStore } from '@/store'
import { getActiveCollabReadScope } from '@/store/slices/activecollab-cache'
import { findCachedActiveCollabTask } from '@/store/slices/activecollab-task-patch'

/** undefined while loading; null when ActiveCollab has no open row for it. */
export type Loaded<T> = T | null | undefined

const projectTasks = new Map<number, ActiveCollabTask[] | null>()
const loading = new Set<string>()
let projects: ActiveCollabProject[] | null | undefined
const listeners = new Set<() => void>()

function changed(): void {
  listeners.forEach((listener) => listener())
}

function scope() {
  return getActiveCollabReadScope(useAppStore.getState().settings)
}

/** The connected instance's URL, or null when ActiveCollab is not connected. */
export function activeCollabInstance(): string | null {
  const status = useAppStore.getState().activeCollabStatus
  return status?.configured ? (status.connection?.instanceUrl ?? null) : null
}

export function onActiveCollabPageData(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Forgets loaded rows so an opened page shows current status. */
export function refreshActiveCollabPageData(): void {
  projectTasks.clear()
  projects = undefined
}

function loadOnce(key: string, run: () => Promise<void>): void {
  if (loading.has(key)) {
    return
  }
  loading.add(key)
  void run()
    .catch(() => undefined)
    .finally(() => {
      loading.delete(key)
      changed()
    })
}

function loadProjectTasks(projectId: number): void {
  loadOnce(`tasks:${projectId}`, async () => {
    const result = await activeCollabListProjectTasks({ projectId }, scope().settings)
    projectTasks.set(projectId, result.ok ? result.value.tasks : null)
  })
}

export function pageTask(
  ref: Extract<ActiveCollabPageRef, { kind: 'task' }>
): Loaded<ActiveCollabTask> {
  const cached = findCachedActiveCollabTask(useAppStore.getState(), ref.taskId, scope().cachePrefix)
  if (cached) {
    return cached
  }
  if (!projectTasks.has(ref.projectId)) {
    loadProjectTasks(ref.projectId)
    return undefined
  }
  return projectTasks.get(ref.projectId)?.find((task) => task.id === ref.taskId) ?? null
}

export function pageProject(projectId: number): Loaded<ActiveCollabProject> {
  if (projects === undefined) {
    loadOnce('projects', async () => {
      const result = await activeCollabListProjects(scope().settings)
      projects = result.ok ? result.value : null
    })
    return undefined
  }
  return projects?.find((project) => project.id === projectId) ?? null
}

/** One project's open tasks, for the picker; shares the cards' cache. */
export async function projectTaskList(projectId: number): Promise<ActiveCollabTask[]> {
  const result = await activeCollabListProjectTasks({ projectId }, scope().settings)
  const tasks = result.ok ? result.value.tasks : null
  projectTasks.set(projectId, tasks)
  changed()
  return tasks ?? []
}

/** Waits for a row, for inserting a pasted or picked link with its real title. */
export async function loadPageRef(
  ref: ActiveCollabPageRef
): Promise<ActiveCollabTask | ActiveCollabProject | null> {
  for (let tries = 0; tries < 40; tries += 1) {
    const value = ref.kind === 'task' ? pageTask(ref) : pageProject(ref.projectId)
    if (value !== undefined) {
      return value
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

/** Opens the task in the Tasks view; one ActiveCollab no longer lists opens in the browser. */
export function openActiveCollabRef(ref: ActiveCollabPageRef): void {
  const instance = activeCollabInstance()
  if (ref.kind === 'task' && pageTask(ref) === null && instance) {
    void window.api.shell.openUrl(activeCollabUrl(instance, ref))
    return
  }
  const store = useAppStore.getState()
  if (ref.kind === 'task') {
    store.requestActiveCollabTask({ projectId: ref.projectId, taskId: ref.taskId })
  }
  store.openTaskPage()
}
