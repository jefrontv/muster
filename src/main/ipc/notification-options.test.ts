import { describe, expect, it } from 'vitest'
import type { NotificationDispatchRequest } from '../../shared/types'
import { buildNotificationOptions } from './notification-options'

function acRequest(
  source: NotificationDispatchRequest['source'],
  activeCollab: NotificationDispatchRequest['activeCollab']
): NotificationDispatchRequest {
  return { source, activeCollab }
}

const TASK = {
  taskId: 1,
  projectId: 2,
  taskName: 'Fix the header',
  projectName: 'Website Redesign'
}

describe('ActiveCollab notification wording', () => {
  it('leads with the change and names the project in the detailed style', () => {
    expect(
      buildNotificationOptions(
        acRequest('activecollab-comments', { ...TASK, newComments: 2 }),
        'detailed'
      )
    ).toEqual({
      title: '2 new comments: Fix the header',
      body: 'Website Redesign'
    })
  })

  it('leads with the task and drops the project in the minimal style', () => {
    expect(
      buildNotificationOptions(
        acRequest('activecollab-comments', { ...TASK, newComments: 2 }),
        'minimal'
      )
    ).toEqual({
      title: 'Fix the header',
      body: '2 new comments'
    })
  })

  it('swaps title and body for every ActiveCollab source, not just comments', () => {
    const cases = [
      {
        request: acRequest('activecollab-assigned', TASK),
        detailed: { title: 'Assigned to you: Fix the header', body: 'Website Redesign' },
        minimal: { title: 'Fix the header', body: 'Assigned to you' }
      },
      {
        request: acRequest('activecollab-due', { ...TASK, duePhrase: 'Overdue' }),
        detailed: { title: 'Overdue: Fix the header', body: 'Website Redesign' },
        minimal: { title: 'Fix the header', body: 'Overdue' }
      },
      {
        request: acRequest('activecollab-updated', TASK),
        detailed: { title: 'Task updated: Fix the header', body: 'Website Redesign' },
        minimal: { title: 'Fix the header', body: 'Task updated' }
      }
    ]

    for (const testCase of cases) {
      expect(buildNotificationOptions(testCase.request, 'detailed')).toEqual(testCase.detailed)
      expect(buildNotificationOptions(testCase.request, 'minimal')).toEqual(testCase.minimal)
    }
  })

  it('keeps the due phrase on a detailed assignment but not a minimal one', () => {
    const request = acRequest('activecollab-assigned', { ...TASK, duePhrase: 'Overdue' })

    expect(buildNotificationOptions(request, 'detailed').body).toBe('Website Redesign · Overdue')
    // Minimal already leads with the change, and 'Assigned to you · Overdue' buries the task name.
    expect(buildNotificationOptions(request, 'minimal').body).toBe('Assigned to you')
  })

  it('singularises a single comment in both styles', () => {
    expect(
      buildNotificationOptions(
        acRequest('activecollab-comments', { ...TASK, newComments: 1 }),
        'detailed'
      ).title
    ).toBe('1 new comment: Fix the header')
    expect(
      buildNotificationOptions(
        acRequest('activecollab-comments', { ...TASK, newComments: 1 }),
        'minimal'
      ).body
    ).toBe('1 new comment')
  })

  it('defaults to the detailed style, so an unmigrated caller reads as it always did', () => {
    expect(buildNotificationOptions(acRequest('activecollab-updated', TASK))).toEqual({
      title: 'Task updated: Fix the header',
      body: 'Website Redesign'
    })
  })

  it('names a project-less task without leaving an empty banner in either style', () => {
    expect(
      buildNotificationOptions(
        acRequest('activecollab-updated', {
          taskId: 1,
          projectId: 2,
          taskName: '',
          projectName: ''
        }),
        'detailed'
      )
    ).toEqual({ title: 'Task updated: a task', body: 'ActiveCollab' })
    expect(
      buildNotificationOptions(
        acRequest('activecollab-updated', {
          taskId: 1,
          projectId: 2,
          taskName: '',
          projectName: ''
        }),
        'minimal'
      )
    ).toEqual({ title: 'a task', body: 'Task updated' })
  })

  it('leaves non-ActiveCollab sources untouched by the style setting', () => {
    const bell: NotificationDispatchRequest = {
      source: 'terminal-bell',
      worktreeLabel: 'feature/x',
      repoLabel: 'muster'
    }

    expect(buildNotificationOptions(bell, 'minimal')).toEqual(
      buildNotificationOptions(bell, 'detailed')
    )
  })
})
