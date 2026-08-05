import { describe, expect, it } from 'vitest'
import type { ActiveCollabTask } from '../../../shared/activecollab-types'
import type { Site } from '../../../shared/site-types'
import {
  buildActiveCollabTaskPermalink,
  buildActiveCollabWorkspaceRequest
} from './activecollab-start-work'

const INSTANCE = 'https://projects.efront.com.au'

const TASK = {
  id: 509749,
  projectId: 5937,
  projectName: 'Orleton',
  taskNumber: 12,
  name: 'Walk in form',
  bodyHtml: '',
  isCompleted: false,
  dueOn: null,
  createdOn: null,
  updatedOn: null,
  assigneeId: 407,
  assigneeName: 'Jake Varrese',
  createdById: null,
  createdByName: null,
  labels: [],
  commentCount: 0,
  urlPath: '/projects/5937/tasks/509749'
} as unknown as ActiveCollabTask

const SITE = { id: 'acme', displayName: 'Acme' } as unknown as Site

describe('buildActiveCollabTaskPermalink', () => {
  it('joins the relative path onto the instance', () => {
    expect(buildActiveCollabTaskPermalink(INSTANCE, '/projects/5937/tasks/509749')).toBe(
      'https://projects.efront.com.au/projects/5937/tasks/509749'
    )
  })

  it('does not double the slash when the instance has a trailing one', () => {
    expect(buildActiveCollabTaskPermalink(`${INSTANCE}/`, '/projects/1/tasks/2')).toBe(
      'https://projects.efront.com.au/projects/1/tasks/2'
    )
  })

  it('answers null without an instance, because a relative path is not a link', () => {
    expect(buildActiveCollabTaskPermalink(null, '/projects/1/tasks/2')).toBeNull()
  })
})

describe('buildActiveCollabWorkspaceRequest', () => {
  it('targets the bound site repo and carries the task as a linked item', () => {
    const request = buildActiveCollabWorkspaceRequest({
      binding: { kind: 'ready', site: SITE, repoId: 'repo-1' },
      task: TASK,
      instanceUrl: INSTANCE
    })

    expect(request.initialRepoId).toBe('repo-1')
    expect(request.linkedWorkItem.provider).toBe('activecollab')
    expect(request.linkedWorkItem.url).toBe(
      'https://projects.efront.com.au/projects/5937/tasks/509749'
    )
    expect(request.linkedWorkItem.title).toBe('Walk in form')
    expect(request.prefilledName.length).toBeGreaterThan(0)
  })

  it('identifies the task by project and id, because task numbers repeat across projects', () => {
    const request = buildActiveCollabWorkspaceRequest({
      binding: { kind: 'ready', site: SITE, repoId: 'repo-1' },
      task: TASK,
      instanceUrl: INSTANCE
    })

    expect(request.linkedWorkItem.activeCollabIdentifier).toBe('5937/509749')
  })

  it('carries the instance and project on the task source context', () => {
    const request = buildActiveCollabWorkspaceRequest({
      binding: { kind: 'ready', site: SITE, repoId: 'repo-1' },
      task: TASK,
      instanceUrl: INSTANCE
    })

    expect(request.taskSourceContext.provider).toBe('activecollab')
    expect(request.taskSourceContext.projectId).toBe('5937')
    expect(request.taskSourceContext.providerIdentity).toMatchObject({
      provider: 'activecollab',
      instanceUrl: INSTANCE,
      projectName: 'Orleton'
    })
  })

  it('still builds a request when the instance is unknown, minus the dead link', () => {
    // A relative path is not a link, so the item carries no url rather than a broken one; the
    // workspace is still worth creating and the agent brief degrades to the task name.
    const request = buildActiveCollabWorkspaceRequest({
      binding: { kind: 'ready', site: SITE, repoId: 'repo-1' },
      task: TASK,
      instanceUrl: null
    })

    expect(request.linkedWorkItem.url).toBe('')
    expect(request.prefilledName.length).toBeGreaterThan(0)
  })
})
