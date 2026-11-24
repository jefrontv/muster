import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  credential: vi.fn(),
  listProjectTasks: vi.fn(),
  listProjects: vi.fn()
}))
vi.mock('../activecollab/credential-store', () => ({ getActiveCollabCredential: mocks.credential }))
vi.mock('../activecollab/http', () => ({ createAcHttp: () => ({}) }))
vi.mock('../activecollab/name-directory', () => ({
  acNameDirectory: () => () => Promise.resolve({ projects: new Map(), users: new Map() }),
  acResolveTaskNames: () => Promise.resolve()
}))
vi.mock('../activecollab/tasks', () => ({
  listProjectTasks: mocks.listProjectTasks,
  listProjects: mocks.listProjects
}))

import { createProjectPagesActiveCollab } from './project-pages-activecollab-lookup'

const AC = 'https://ac.example.com'
const task = {
  id: 9,
  projectId: 4,
  projectName: 'Acme',
  taskNumber: 12,
  name: 'Fix the header',
  isCompleted: false,
  assigneeName: 'Sam',
  dueOn: Date.UTC(2026, 10, 30),
  labels: [{ name: 'URGENT', color: null }]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.credential.mockReturnValue({ instanceUrl: AC, token: 't', userId: Math.random() })
  mocks.listProjectTasks.mockResolvedValue({ projectId: 4, tasks: [task], taskLists: [] })
  mocks.listProjects.mockResolvedValue([
    { id: 4, name: 'Acme', isCompleted: false, openTaskCount: 3 }
  ])
})

describe('read_page ActiveCollab rows', () => {
  it('describes linked tasks and projects from the list endpoints', async () => {
    const md = `[Fix](${AC}/projects/4/tasks/9) [Gone](${AC}/projects/4/tasks/8) [Acme](${AC}/projects/4)`
    const rows = await createProjectPagesActiveCollab().describe(md)
    expect(rows).toEqual([
      {
        kind: 'task',
        url: `${AC}/projects/4/tasks/9`,
        title: 'Fix the header',
        project: 'Acme',
        number: 12,
        status: 'open',
        assignee: 'Sam',
        due: '2026-11-30',
        labels: ['URGENT']
      },
      { kind: 'task', url: `${AC}/projects/4/tasks/8`, status: 'closed or not visible' },
      { kind: 'project', url: `${AC}/projects/4`, title: 'Acme', status: 'active', open_tasks: 3 }
    ])
    expect(mocks.listProjectTasks).toHaveBeenCalledTimes(1)
  })

  it('returns null when ActiveCollab is not connected', async () => {
    mocks.credential.mockReturnValue(null)
    expect(await createProjectPagesActiveCollab().describe(`${AC}/projects/4`)).toBeNull()
  })

  it('marks rows unknown when a list call fails', async () => {
    mocks.listProjects.mockRejectedValue(new Error('offline'))
    expect(await createProjectPagesActiveCollab().describe(`${AC}/projects/4`)).toEqual([
      { kind: 'project', url: `${AC}/projects/4`, status: 'unknown' }
    ])
  })
})
