// Task title and project name for a draft card, cached per task.
// Never the task detail read: that GET marks the task's ActiveCollab updates seen.
import type { ActiveCollabResult } from '../../shared/activecollab-api-types'
import type { ActiveCollabProject, ActiveCollabProjectTasks } from '../../shared/activecollab-types'
import type { BotsCommentDraftTask } from '../../shared/bots-comment-draft-types'

export type BotsDraftTaskSources = {
  listProjects: () => Promise<ActiveCollabResult<ActiveCollabProject[]>>
  listProjectTasks: (args: {
    projectId: number
  }) => Promise<ActiveCollabResult<ActiveCollabProjectTasks>>
}

// A task missing from the open list (completed, moved) is retried after this, not on every refetch.
const MISS_TTL_MS = 5 * 60_000

export function createBotsDraftTaskLookup(
  sources: BotsDraftTaskSources,
  now: () => number = Date.now
): {
  lookup: (ref: { projectId: number; taskId: number }) => Promise<BotsCommentDraftTask>
  reset: () => void
} {
  const tasks = new Map<number, { task: BotsCommentDraftTask; missUntil: number | null }>()
  const projectLoads = new Map<number, Promise<void>>()
  let projectNames: Promise<Map<number, string>> | null = null

  function loadProjectNames(): Promise<Map<number, string>> {
    projectNames ??= sources.listProjects().then((result) => {
      if (!result.ok) {
        projectNames = null
        return new Map()
      }
      return new Map(result.value.map((project) => [project.id, project.name]))
    })
    return projectNames
  }

  // One list read fills every task of the project, so several drafts in a project cost one request.
  function loadProject(projectId: number): Promise<void> {
    const pending = projectLoads.get(projectId)
    if (pending) {
      return pending
    }
    const load = (async () => {
      const [result, names] = await Promise.all([
        sources.listProjectTasks({ projectId }),
        loadProjectNames()
      ])
      if (!result.ok) {
        return
      }
      for (const row of result.value.tasks) {
        tasks.set(row.id, {
          task: {
            title: row.name,
            taskNumber: row.taskNumber,
            projectName: names.get(projectId) ?? (row.projectName || null)
          },
          missUntil: null
        })
      }
    })().finally(() => projectLoads.delete(projectId))
    projectLoads.set(projectId, load)
    return load
  }

  return {
    async lookup({ projectId, taskId }) {
      const cached = tasks.get(taskId)
      if (cached && (cached.missUntil === null || cached.missUntil > now())) {
        return cached.task
      }
      try {
        await loadProject(projectId)
      } catch {
        // Falls through to the project-only answer below.
      }
      const found = tasks.get(taskId)
      if (found && found.missUntil === null) {
        return found.task
      }
      const names = await loadProjectNames().catch(() => new Map<number, string>())
      const miss = { title: null, taskNumber: null, projectName: names.get(projectId) ?? null }
      tasks.set(taskId, { task: miss, missUntil: now() + MISS_TTL_MS })
      return miss
    },
    reset() {
      tasks.clear()
      projectNames = null
    }
  }
}
