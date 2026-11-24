// What read_page reports about the ActiveCollab tasks and projects a page links to. Uses the list
// endpoints only: a task detail GET marks the task's updates as seen.
import type { ActiveCollabProject, ActiveCollabTask } from '../../shared/activecollab-types'
import {
  activeCollabRefsIn,
  activeCollabUrl,
  type ActiveCollabPageRef
} from '../../shared/project-pages-activecollab-links'
import { getActiveCollabCredential } from '../activecollab/credential-store'
import { createAcHttp, type AcHttpClient } from '../activecollab/http'
import { acNameDirectory, acResolveTaskNames } from '../activecollab/name-directory'
import { listProjects, listProjectTasks } from '../activecollab/tasks'

export type ProjectPagesActiveCollab = {
  /** One row per linked task or project; null when ActiveCollab is not connected. */
  describe: (markdown: string) => Promise<Record<string, unknown>[] | null>
}

const BUDGET_MS = 2_000
const CACHE_MS = 60_000
const MAX_REFS = 20

const cache = new Map<string, { at: number; value: Promise<unknown> }>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.value as Promise<T>
  }
  const value = load()
  cache.set(key, { at: Date.now(), value })
  value.catch(() => cache.delete(key))
  return value
}

function day(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString().slice(0, 10)
}

function taskRow(task: ActiveCollabTask): Record<string, unknown> {
  return {
    title: task.name,
    project: task.projectName,
    number: task.taskNumber,
    status: task.isCompleted ? 'done' : 'open',
    assignee: task.assigneeName,
    due: day(task.dueOn),
    labels: task.labels.map((label) => label.name)
  }
}

function projectRow(project: ActiveCollabProject): Record<string, unknown> {
  return {
    title: project.name,
    status: project.isCompleted ? 'completed' : 'active',
    open_tasks: project.openTaskCount
  }
}

type Lookup = { http: AcHttpClient; prefix: string; instanceUrl: string; userId: number }

async function describeRef(
  { http, prefix, instanceUrl, userId }: Lookup,
  ref: ActiveCollabPageRef
): Promise<Record<string, unknown>> {
  if (ref.kind === 'task') {
    const tasks = await cached(`${prefix}|tasks:${ref.projectId}`, async () => {
      const { tasks: rows } = await listProjectTasks({ http, projectId: ref.projectId })
      // The list wire leaves project and assignee names out.
      await acResolveTaskNames(acNameDirectory({ http, instanceUrl, userId })(), rows)
      return rows
    })
    const task = tasks.find((row) => row.id === ref.taskId)
    return task ? taskRow(task) : { status: 'closed or not visible' }
  }
  const projects = await cached(`${prefix}|projects`, () => listProjects({ http }))
  const project = projects.find((row) => row.id === ref.projectId)
  return project ? projectRow(project) : { status: 'not visible' }
}

export function createProjectPagesActiveCollab(): ProjectPagesActiveCollab {
  return {
    async describe(markdown) {
      let credential: ReturnType<typeof getActiveCollabCredential> = null
      try {
        credential = getActiveCollabCredential()
      } catch {
        return null
      }
      if (!credential) {
        return null
      }
      const instance = credential.instanceUrl
      const refs = activeCollabRefsIn(markdown, instance).slice(0, MAX_REFS)
      if (refs.length === 0) {
        return []
      }
      const http = createAcHttp({ baseUrl: instance, token: credential.token })
      const lookup: Lookup = {
        http,
        prefix: `${instance}|${credential.userId}`,
        instanceUrl: instance,
        userId: credential.userId
      }
      const base = (ref: ActiveCollabPageRef) => ({
        kind: ref.kind,
        url: activeCollabUrl(instance, ref)
      })
      const rows = Promise.all(
        refs.map(async (ref) => ({
          ...base(ref),
          ...(await describeRef(lookup, ref).catch(() => ({ status: 'unknown' })))
        }))
      )
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), BUDGET_MS)
      })
      const done = await Promise.race([rows, late])
      clearTimeout(timer)
      return (
        done ?? refs.map((ref) => ({ ...base(ref), status: 'unknown (ActiveCollab was slow)' }))
      )
    }
  }
}

let shared: ProjectPagesActiveCollab | null = null
export function projectPagesActiveCollab(): ProjectPagesActiveCollab {
  shared ??= createProjectPagesActiveCollab()
  return shared
}
