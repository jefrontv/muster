import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Store } from '../persistence'
import type { Repo } from '../../shared/types'
import { getLocalRepoForRegisteredWorktree } from './local-worktree-runtime-options'

const root = resolve('/tmp/muster-lookup')

function repo(id: string, path: string, connectionId?: string): Repo {
  return {
    id,
    path,
    displayName: id,
    kind: 'git',
    ...(connectionId ? { connectionId } : {})
  } as Repo
}

function storeWith(repos: Repo[], metaIds: string[]): Store {
  return {
    getRepos: () => repos,
    getAllWorktreeMeta: () => Object.fromEntries(metaIds.map((id) => [id, {}]))
  } as unknown as Store
}

describe('getLocalRepoForRegisteredWorktree', () => {
  it('matches a repo root by path', () => {
    const a = repo('a', join(root, 'a'))
    const b = repo('b', join(root, 'b'))
    const store = storeWith([a, b], [])
    expect(getLocalRepoForRegisteredWorktree(store, b.path, b.path)?.id).toBe('b')
  })

  it('matches a linked worktree through its meta row', () => {
    const a = repo('a', join(root, 'a'))
    const b = repo('b', join(root, 'b'))
    const linked = join(root, 'wt', 'feature')
    const store = storeWith([a, b], [`a::${join(root, 'a')}`, `b::${linked}`])
    expect(getLocalRepoForRegisteredWorktree(store, linked, linked)?.id).toBe('b')
  })

  it('keeps repo order when an earlier repo matches by meta and a later one by path', () => {
    const shared = join(root, 'shared')
    const a = repo('a', join(root, 'a'))
    const b = repo('b', shared)
    const store = storeWith([a, b], [`a::${shared}`])
    expect(getLocalRepoForRegisteredWorktree(store, shared, shared)?.id).toBe('a')
  })

  it('ignores SSH repos and unknown paths', () => {
    const remote = repo('r', join(root, 'r'), 'conn-1')
    const store = storeWith([remote], [`r::${join(root, 'r', 'wt')}`])
    expect(getLocalRepoForRegisteredWorktree(store, remote.path, remote.path)).toBeUndefined()
    expect(
      getLocalRepoForRegisteredWorktree(store, join(root, 'r', 'wt'), join(root, 'r', 'wt'))
    ).toBeUndefined()
  })
})
