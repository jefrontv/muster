import { describe, expect, it } from 'vitest'
import type { ActiveCollabTask } from '../../../../shared/activecollab-types'
import { groupTasksByProject } from './NativeChatTaskPickerMenu'

const task = (overrides: Partial<ActiveCollabTask>): ActiveCollabTask =>
  ({
    id: 1,
    name: 'Task',
    projectId: 10,
    projectName: 'Alpha',
    isCompleted: false,
    dueOn: null,
    assigneeName: null,
    ...overrides
  }) as ActiveCollabTask

describe('groupTasksByProject', () => {
  it('buckets open tasks by project, alphabetical', () => {
    const groups = groupTasksByProject(
      [
        task({ id: 1, projectId: 20, projectName: 'Zulu' }),
        task({ id: 2, projectId: 10, projectName: 'Alpha' }),
        task({ id: 3, projectId: 20, projectName: 'Zulu' })
      ],
      null
    )
    expect(groups.map((g) => g.projectName)).toEqual(['Alpha', 'Zulu'])
    expect(groups[1]?.tasks.map((t) => t.id)).toEqual([1, 3])
  })

  it('puts the bound workspace project first', () => {
    const groups = groupTasksByProject(
      [
        task({ id: 1, projectId: 10, projectName: 'Alpha' }),
        task({ id: 2, projectId: 20, projectName: 'Zulu' })
      ],
      20
    )
    expect(groups.map((g) => g.projectId)).toEqual([20, 10])
  })

  it('drops completed tasks', () => {
    const groups = groupTasksByProject([task({ id: 1, isCompleted: true })], null)
    expect(groups).toEqual([])
  })
})
