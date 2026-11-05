import { describe, expect, it } from 'vitest'
import { isAsyncAgentLaunch, parseTaskNotification } from './chat-background-agent'

describe('isAsyncAgentLaunch', () => {
  it('reads the launch notice or the structured status', () => {
    expect(isAsyncAgentLaunch('Async agent launched successfully. (internal)')).toBe(true)
    expect(isAsyncAgentLaunch('', { status: 'async_launched' })).toBe(true)
    expect(isAsyncAgentLaunch('All headers fine.', { status: 'completed' })).toBe(false)
  })
})

describe('parseTaskNotification', () => {
  const note = (status: string, extra = ''): string =>
    `<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>${status}</status>\n<summary>Agent "x" finished</summary>\n${extra}</task-notification>`

  it('maps the status and prefers the result over the summary', () => {
    expect(parseTaskNotification(note('completed', '<result>cron\nwp-content</result>\n'))).toEqual(
      { toolUseId: 'toolu_1', status: 'done', summary: 'cron\nwp-content' }
    )
    expect(parseTaskNotification(note('killed'))).toMatchObject({
      status: 'stopped',
      summary: 'Agent "x" finished'
    })
  })

  it('ignores text that only mentions a notification', () => {
    expect(parseTaskNotification(`Look at this: ${note('completed')}`)).toBeNull()
    expect(parseTaskNotification(note('mystery'))).toBeNull()
  })
})
