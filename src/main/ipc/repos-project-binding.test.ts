// The `projects:update` validation boundary for the ActiveCollab project binding.
//
// Worth its own file: a zod object silently DROPS keys it does not declare, so a binding that never
// reaches `store.updateProject` produces no error anywhere — the renderer's optimistic state would
// show the binding set while nothing was written, and it would vanish on the next reload. The clear
// path is worse: an unbind that arrives as an undeclared key reads as "leave it alone", so the user
// would press the button and nothing would happen.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock, mockStore } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  mockStore: {
    getRepos: vi.fn().mockReturnValue([]),
    getProjects: vi.fn().mockReturnValue([]),
    updateProject: vi.fn()
  }
}))

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: handleMock, removeHandler: vi.fn() }
}))

vi.mock('../git/repo', () => ({
  isGitRepo: vi.fn().mockReturnValue(true),
  getRepoName: vi.fn().mockImplementation((path: string) => path.split('/').pop()),
  getBaseRefDefault: vi.fn().mockResolvedValue('origin/main'),
  searchBaseRefs: vi.fn().mockResolvedValue([]),
  BASE_REF_SEARCH_ARGS: ['for-each-ref'],
  filterBaseRefSearchOutput: vi.fn().mockReturnValue([])
}))

vi.mock('./filesystem-auth', () => ({ invalidateAuthorizedRootsCache: vi.fn() }))
vi.mock('../providers/ssh-git-dispatch', () => ({ getSshGitProvider: vi.fn() }))
vi.mock('./ssh', () => ({ getActiveMultiplexer: vi.fn() }))

import { registerRepoHandlers } from './repos'

type HandlerMap = Map<string, (event: unknown, args: unknown) => unknown>

const BINDING = { projectId: 3790, projectName: 'Website Rebuild', boundAt: 1700 }

describe('projects:update ActiveCollab binding validation', () => {
  const handlers: HandlerMap = new Map()
  const mainWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } }

  function update(updates: unknown): unknown {
    return handlers.get('projects:update')!(null, { projectId: 'project-1', updates })
  }

  beforeEach(() => {
    handlers.clear()
    handleMock.mockReset()
    handleMock.mockImplementation((channel: string, handler: (...a: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
    mockStore.updateProject.mockReset().mockReturnValue({ id: 'project-1' })
    registerRepoHandlers(mainWindow as never, mockStore as never)
  })

  it('passes a binding through to the store', () => {
    update({ activeCollabBinding: BINDING })

    expect(mockStore.updateProject).toHaveBeenCalledWith('project-1', {
      activeCollabBinding: BINDING
    })
  })

  it('passes an explicit null through so the store can distinguish a clear', () => {
    update({ activeCollabBinding: null })

    const [, updates] = mockStore.updateProject.mock.calls[0] ?? []
    expect(updates).toHaveProperty('activeCollabBinding', null)
  })

  it('leaves the binding untouched when the key is absent', () => {
    update({ localWindowsRuntimePreference: { kind: 'windows-host' } })

    const [, updates] = mockStore.updateProject.mock.calls[0] ?? []
    expect(updates).not.toHaveProperty('activeCollabBinding')
  })

  it('rejects a binding the ActiveCollab API could never have produced', () => {
    expect(() =>
      update({ activeCollabBinding: { projectId: 0, projectName: 'x', boundAt: 1 } })
    ).toThrow()
    expect(() =>
      update({ activeCollabBinding: { projectId: 3790, projectName: '', boundAt: 1 } })
    ).toThrow()
    expect(() =>
      update({ activeCollabBinding: { projectId: '3790', projectName: 'x', boundAt: 1 } })
    ).toThrow()
    expect(mockStore.updateProject).not.toHaveBeenCalled()
  })
})
