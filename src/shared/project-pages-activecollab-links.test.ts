import { describe, expect, it } from 'vitest'
import {
  activeCollabRefsIn,
  activeCollabTaskLinks,
  activeCollabUrl,
  parseActiveCollabUrl
} from './project-pages-activecollab-links'

const AC = 'https://app.activecollab.com/123/'

describe('ActiveCollab page links', () => {
  it('finds task links with their link text, whatever the instance', () => {
    const md = [
      '[Fix \\[nav\\] spacing](https://AC.example.com/projects/4/tasks/9) and',
      'https://ac.example.com/projects/4/tasks/9 again, https://ac.example.com/projects/4/tasks/10',
      '[project](https://ac.example.com/projects/4) https://github.com/o/r/issues/9'
    ].join('\n')
    expect(activeCollabTaskLinks(md)).toEqual([
      {
        key: 'ac.example.com/tasks/9',
        href: 'https://AC.example.com/projects/4/tasks/9',
        title: 'Fix [nav] spacing'
      },
      {
        key: 'ac.example.com/tasks/10',
        href: 'https://ac.example.com/projects/4/tasks/10',
        title: 'Task 10'
      }
    ])
  })

  it('reads task and project URLs on the connected instance', () => {
    expect(parseActiveCollabUrl(`${AC}projects/37/tasks/509`, AC)).toEqual({
      kind: 'task',
      projectId: 37,
      taskId: 509
    })
    expect(parseActiveCollabUrl('https://APP.activecollab.com/123/projects/37?x=1', AC)).toEqual({
      kind: 'project',
      projectId: 37
    })
  })

  it('ignores other instances and other ActiveCollab pages', () => {
    expect(parseActiveCollabUrl('https://app.activecollab.com/999/projects/37', AC)).toBeNull()
    expect(parseActiveCollabUrl(`${AC}projects/37/files`, AC)).toBeNull()
    expect(parseActiveCollabUrl(`${AC}projects/37`, '')).toBeNull()
  })

  it('builds URLs and lists each linked ref once', () => {
    const task = { kind: 'task', projectId: 37, taskId: 509 } as const
    const url = activeCollabUrl(AC, task)
    expect(url).toBe('https://app.activecollab.com/123/projects/37/tasks/509')
    const markdown = `[Fix DNS](${url}) and again ${url}, plus <${AC}projects/37>`
    expect(activeCollabRefsIn(markdown, AC)).toEqual([task, { kind: 'project', projectId: 37 }])
  })
})
