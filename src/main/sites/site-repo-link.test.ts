// The rule that broke in the field: removing a project from the sidebar leaves the site's repoId
// pointing at a repo that no longer exists, and "Add to sidebar" then skipped that site forever —
// it reported success and nothing appeared, with no way to fix it from the UI.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/types'
import type { Store } from '../persistence'
import { linkSitesToRepos, type AddRepoFn } from './site-repo-link'

/** Real directories, because the linker checks the checkout is actually on disk. */
function realPath(): string {
  return mkdtempSync(path.join(tmpdir(), 'muster-link-'))
}

type SiteRow = { id: string; path: string; repoId: string | null }

function createStore(sites: SiteRow[], repoIds: string[]) {
  const updates: { id: string; repoId: string }[] = []
  const store = {
    listSites: () => sites,
    getRepo: (id: string) => (repoIds.includes(id) ? ({ id } as Repo) : undefined),
    updateSite: (id: string, patch: { repoId: string }) => {
      updates.push({ id, repoId: patch.repoId })
    }
  } as unknown as Store
  return { store, updates }
}

function addRepoReturning(id: string, alreadyExisted = false): AddRepoFn {
  return vi.fn().mockResolvedValue({ repo: { id } as Repo, alreadyExisted }) as unknown as AddRepoFn
}

describe('linkSitesToRepos', () => {
  it('relinks a site whose repo was removed from the sidebar', async () => {
    const sitePath = realPath()
    const { store, updates } = createStore([{ id: 'site-1', path: sitePath, repoId: 'gone' }], [])

    const result = await linkSitesToRepos(store, addRepoReturning('repo-new'))

    expect(result.eligible).toBe(1)
    expect(result.added).toBe(1)
    expect(updates).toEqual([{ id: 'site-1', repoId: 'repo-new' }])
  })

  it('leaves a site alone while its repo still exists', async () => {
    const sitePath = realPath()
    const add = addRepoReturning('repo-new')
    const { store, updates } = createStore(
      [{ id: 'site-1', path: sitePath, repoId: 'repo-live' }],
      ['repo-live']
    )

    const result = await linkSitesToRepos(store, add)

    expect(result.eligible).toBe(0)
    expect(add).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('links a site that never had a repo', async () => {
    const sitePath = realPath()
    const { store, updates } = createStore([{ id: 'site-1', path: sitePath, repoId: null }], [])

    const result = await linkSitesToRepos(store, addRepoReturning('repo-new', true))

    expect(result.linked).toBe(1)
    expect(updates).toEqual([{ id: 'site-1', repoId: 'repo-new' }])
  })

  // A folder on an unmounted volume must not be reported as a failure, and must stay relinkable.
  it('skips a checkout that is not on disk without counting it', async () => {
    const add = addRepoReturning('repo-new')
    const { store, updates } = createStore(
      [{ id: 'site-1', path: '/nowhere/muster-missing', repoId: 'gone' }],
      []
    )

    const result = await linkSitesToRepos(store, add)

    expect(result.eligible).toBe(0)
    expect(add).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('falls back to a folder repo when the path is not a git checkout', async () => {
    const sitePath = realPath()
    const add = vi
      .fn()
      .mockResolvedValueOnce({ error: 'not a git repository' })
      .mockResolvedValueOnce({ repo: { id: 'repo-folder' } as Repo, alreadyExisted: false })
    const { store, updates } = createStore([{ id: 'site-1', path: sitePath, repoId: 'gone' }], [])

    const result = await linkSitesToRepos(store, add as unknown as AddRepoFn)

    expect(add).toHaveBeenNthCalledWith(1, store, sitePath, 'git')
    expect(add).toHaveBeenNthCalledWith(2, store, sitePath, 'folder')
    expect(result.added).toBe(1)
    expect(updates).toEqual([{ id: 'site-1', repoId: 'repo-folder' }])
  })
})
