import { describe, expect, it } from 'vitest'
import { canBrowseSidebarTasks } from './sidebar-tasks-browse'

describe('canBrowseSidebarTasks', () => {
  it('stays locked when there is no git repo and ActiveCollab is not connected', () => {
    expect(
      canBrowseSidebarTasks({
        repos: [{ kind: 'folder' }],
        activeCollabConfigured: false
      })
    ).toBe(false)
    expect(canBrowseSidebarTasks({ repos: [], activeCollabConfigured: false })).toBe(false)
  })

  it('unlocks after ActiveCollab login even with no git repo', () => {
    expect(canBrowseSidebarTasks({ repos: [], activeCollabConfigured: true })).toBe(true)
    expect(
      canBrowseSidebarTasks({
        repos: [{ kind: 'folder' }],
        activeCollabConfigured: true
      })
    ).toBe(true)
  })

  it('unlocks when a git repo is present without ActiveCollab', () => {
    expect(
      canBrowseSidebarTasks({
        repos: [{ kind: 'git' }],
        activeCollabConfigured: false
      })
    ).toBe(true)
  })
})
