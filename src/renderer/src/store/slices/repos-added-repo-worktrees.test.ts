import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { Repo } from '../../../../shared/types'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'

const existing: Repo = {
  id: 'old',
  path: '/old',
  displayName: 'Old',
  badgeColor: '#000',
  addedAt: 1
}
const added: Repo = { id: 'edm', path: '/edm', displayName: 'edm', badgeColor: '#111', addedAt: 2 }
const reposList = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  reposList.mockReset()
  vi.stubGlobal('window', { api: { repos: { list: reposList } } })
})

// A repo added from the Sites page while the sidebar is unmounted showed as a folder row with no
// worktree to click, because only the sidebar's repo-count effect fetched its worktrees.
describe('fetchRepos and newly added repos', () => {
  it('fetches worktrees for a repo it has not seen before, once startup has scanned', async () => {
    const store = createTestStore()
    const fetchWorktrees = vi.fn(async (_repoId: string) => true)
    store.setState({ repos: [existing], startupWorktreeRefreshCompleted: true, fetchWorktrees })
    reposList.mockResolvedValueOnce([existing, added])

    await store.getState().fetchRepos()

    expect(fetchWorktrees).toHaveBeenCalledTimes(1)
    expect(fetchWorktrees).toHaveBeenCalledWith('edm')
  })

  it('leaves startup to the initial full scan', async () => {
    const store = createTestStore()
    const fetchWorktrees = vi.fn(async (_repoId: string) => true)
    store.setState({ repos: [], startupWorktreeRefreshCompleted: false, fetchWorktrees })
    reposList.mockResolvedValueOnce([existing, added])

    await store.getState().fetchRepos()

    expect(fetchWorktrees).not.toHaveBeenCalled()
  })
})
