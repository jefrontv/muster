import { describe, expect, it } from 'vitest'
import {
  formatActiveCollabTaskReference,
  parseActiveCollabTaskReferences
} from './native-chat-activecollab-references'

describe('parseActiveCollabTaskReferences', () => {
  it('lifts tokens out of the displayed text', () => {
    const parsed = parseActiveCollabTaskReferences('AC#511081 fix the mobile nav')
    expect(parsed.taskIds).toEqual([511081])
    expect(parsed.text).toBe('fix the mobile nav')
  })

  it('collapses the gap a mid-sentence token leaves behind', () => {
    const parsed = parseActiveCollabTaskReferences('look at AC#42 before standup')
    expect(parsed.taskIds).toEqual([42])
    expect(parsed.text).toBe('look at before standup')
  })

  it('dedupes repeated references and keeps order', () => {
    const parsed = parseActiveCollabTaskReferences('AC#7 relates to AC#9 and AC#7')
    expect(parsed.taskIds).toEqual([7, 9])
  })

  it('ignores lookalikes that are not standalone tokens', () => {
    const parsed = parseActiveCollabTaskReferences('REAC#12 is not a reference')
    expect(parsed.taskIds).toEqual([])
    expect(parsed.text).toBe('REAC#12 is not a reference')
  })

  it('preserves newlines while trimming doubled spaces', () => {
    const parsed = parseActiveCollabTaskReferences('AC#5\nsecond line')
    expect(parsed.taskIds).toEqual([5])
    expect(parsed.text).toBe('second line')
  })

  it('strips a formatted attachment reference line, keeping the id', () => {
    const line = formatActiveCollabTaskReference({
      taskId: 511083,
      projectId: 5463,
      name: 'PCYC mobile nav not working'
    })
    const parsed = parseActiveCollabTaskReferences(`fix this today\n${line}`)
    expect(parsed.taskIds).toEqual([511083])
    expect(parsed.text).toBe('fix this today')
  })

  it('formatted reference tells the agent the MCP route', () => {
    const line = formatActiveCollabTaskReference({ taskId: 7, projectId: 9, name: 'Task "x"' })
    expect(line).toContain('AC#7')
    expect(line).toContain('activecollab MCP')
    expect(line).toContain('project_id 9')
    expect(line).toContain('task_id 7')
  })
})
