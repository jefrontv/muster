import { describe, expect, it } from 'vitest'
import { activeCollabToolEvent } from './native-chat-activecollab-events'

describe('activeCollabToolEvent', () => {
  it('maps write tools to task events with the task and project ids', () => {
    expect(
      activeCollabToolEvent('mcp__activecollab__complete_task', { task_id: 77, project_id: 9 })
    ).toEqual({
      kind: 'complete',
      taskId: 77,
      projectId: 9,
      label: 'Completed task #77'
    })
    expect(
      activeCollabToolEvent('mcp__activecollab__set_task_labels', {
        task_id: 5,
        labels: ['IN PROGRESS']
      })
    ).toEqual({ kind: 'update', taskId: 5, projectId: null, label: 'Labeled task #5 IN PROGRESS' })
    expect(activeCollabToolEvent('mcp__activecollab__post_task_comment', {})).toEqual({
      kind: 'comment',
      taskId: null,
      projectId: null,
      label: 'Commented on a task'
    })
  })

  it('ignores read-only and non-AC tools', () => {
    expect(activeCollabToolEvent('mcp__activecollab__get_task', { task_id: 1 })).toBeNull()
    expect(activeCollabToolEvent('mcp__activecollab__list_my_tasks', {})).toBeNull()
    expect(activeCollabToolEvent('Bash', { command: 'ls' })).toBeNull()
    expect(activeCollabToolEvent('mcp__muster-sites__run_import_functions', {})).toBeNull()
  })
})
