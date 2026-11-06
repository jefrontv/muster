import { describe, expect, it, vi } from 'vitest'
import type { ActiveCollabTask } from '../../shared/activecollab-types'
import { createBotsDraftTaskLookup, type BotsDraftTaskSources } from './bots-comment-draft-tasks'

function task(id: number, name: string): ActiveCollabTask {
  return { id, name, taskNumber: id + 100, projectId: 7, projectName: '' } as ActiveCollabTask
}

function sources(): BotsDraftTaskSources & {
  listProjects: ReturnType<typeof vi.fn>
  listProjectTasks: ReturnType<typeof vi.fn>
} {
  return {
    listProjects: vi.fn(async () => ({
      ok: true as const,
      value: [{ id: 7, name: 'Website', isCompleted: false, openTaskCount: null }]
    })),
    listProjectTasks: vi.fn(async () => ({
      ok: true as const,
      value: { projectId: 7, tasks: [task(1, 'Fix header'), task(2, 'Footer')], taskLists: [] }
    }))
  }
}

describe('bots draft task lookup', () => {
  it('names tasks from one project list read, cached per task', async () => {
    const from = sources()
    const lookup = createBotsDraftTaskLookup(from)
    const [first, second] = await Promise.all([
      lookup.lookup({ projectId: 7, taskId: 1 }),
      lookup.lookup({ projectId: 7, taskId: 2 })
    ])
    expect(first).toEqual({ title: 'Fix header', taskNumber: 101, projectName: 'Website' })
    expect(second.title).toBe('Footer')
    await lookup.lookup({ projectId: 7, taskId: 1 })
    expect(from.listProjectTasks).toHaveBeenCalledTimes(1)
    expect(from.listProjects).toHaveBeenCalledTimes(1)
  })

  it('keeps the project name for a task the open list lacks, and retries it later', async () => {
    const from = sources()
    let now = 0
    const lookup = createBotsDraftTaskLookup(from, () => now)
    expect(await lookup.lookup({ projectId: 7, taskId: 99 })).toEqual({
      title: null,
      taskNumber: null,
      projectName: 'Website'
    })
    await lookup.lookup({ projectId: 7, taskId: 99 })
    expect(from.listProjectTasks).toHaveBeenCalledTimes(1)
    now = 10 * 60_000
    await lookup.lookup({ projectId: 7, taskId: 99 })
    expect(from.listProjectTasks).toHaveBeenCalledTimes(2)
  })
})
