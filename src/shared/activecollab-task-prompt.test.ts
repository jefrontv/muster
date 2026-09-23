import { describe, expect, it } from 'vitest'
import {
  buildActiveCollabTaskPrompt,
  type ActiveCollabTaskPromptTask
} from './activecollab-task-prompt'

function task(overrides: Partial<ActiveCollabTaskPromptTask> = {}): ActiveCollabTaskPromptTask {
  return {
    id: 5678,
    taskNumber: 123,
    name: 'Fix the header on mobile',
    projectId: 42,
    projectName: 'Acme Website',
    ...overrides
  }
}

describe('buildActiveCollabTaskPrompt', () => {
  it('answers null for nothing to send, rather than an empty prompt', () => {
    expect(buildActiveCollabTaskPrompt([])).toBeNull()
  })

  it('carries both numbers for one task, because they address different things', () => {
    const prompt = buildActiveCollabTaskPrompt([task()]) ?? ''
    expect(prompt).toContain('#123')
    expect(prompt).toContain('id 5678')
    expect(prompt).toContain('Fix the header on mobile')
  })

  it('names the project and its id, so the agent can address the task', () => {
    const prompt = buildActiveCollabTaskPrompt([task()]) ?? ''
    expect(prompt).toContain('Acme Website')
    expect(prompt).toContain('id 42')
  })

  it('tells the agent to read the task, which is what makes name-only safe', () => {
    expect(buildActiveCollabTaskPrompt([task()])).toContain('activecollab MCP')
  })

  it('lists several tasks and states the project once', () => {
    const prompt =
      buildActiveCollabTaskPrompt([
        task(),
        task({ id: 5679, taskNumber: 124, name: 'Broken form validation' })
      ]) ?? ''
    expect(prompt).toContain('- #123 (id 5678) Fix the header on mobile')
    expect(prompt).toContain('- #124 (id 5679) Broken form validation')
    expect(prompt.match(/Acme Website/g)).toHaveLength(1)
  })

  it('trims a name that arrived with whitespace', () => {
    expect(buildActiveCollabTaskPrompt([task({ name: '  Padded name \n' })])).toContain(
      'Padded name,'
    )
  })

  it('sends every selected task, with no cap', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      task({ id: 1000 + index, taskNumber: index + 1 })
    )
    const prompt = buildActiveCollabTaskPrompt(many) ?? ''
    expect(prompt.split('\n').filter((row) => row.startsWith('- '))).toHaveLength(25)
  })
})
