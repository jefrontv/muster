import { describe, expect, it } from 'vitest'
import type { Repo, Worktree } from '../../../../shared/types'
import {
  resolveProjectDefaultWorkspaceId,
  resolveProjectGroupDefaultWorkspaceId
} from './palette-project-activation'

function worktree(partial: Partial<Worktree> & { id: string }): Worktree {
  return { isMainWorktree: false, isArchived: false, ...partial } as Worktree
}

function repo(partial: Partial<Repo> & { id: string }): Repo {
  return { displayName: partial.id, ...partial } as Repo
}

describe('resolveProjectDefaultWorkspaceId', () => {
  it('prefers the main checkout', () => {
    expect(
      resolveProjectDefaultWorkspaceId('repo-1', {
        'repo-1': [
          worktree({ id: 'repo-1::feature' }),
          worktree({ id: 'repo-1::main', isMainWorktree: true })
        ]
      })
    ).toBe('repo-1::main')
  })

  it('falls back to the first workspace when no checkout is marked main', () => {
    expect(
      resolveProjectDefaultWorkspaceId('repo-1', {
        'repo-1': [worktree({ id: 'repo-1::first' }), worktree({ id: 'repo-1::second' })]
      })
    ).toBe('repo-1::first')
  })

  it('skips archived workspaces', () => {
    // Why: archived rows are hidden everywhere else, so opening one would strand the user.
    expect(
      resolveProjectDefaultWorkspaceId('repo-1', {
        'repo-1': [
          worktree({ id: 'repo-1::main', isMainWorktree: true, isArchived: true }),
          worktree({ id: 'repo-1::live' })
        ]
      })
    ).toBe('repo-1::live')
  })

  it('reports nothing for an unknown or empty project so the caller can fall back', () => {
    expect(resolveProjectDefaultWorkspaceId('repo-2', { 'repo-1': [] })).toBeNull()
    expect(
      resolveProjectDefaultWorkspaceId('repo-1', {
        'repo-1': [worktree({ id: 'repo-1::gone', isArchived: true })]
      })
    ).toBeNull()
  })
})

describe('resolveProjectGroupDefaultWorkspaceId', () => {
  it('opens the first member repo (sidebar order) that has a workspace', () => {
    const repos = [
      repo({ id: 'repo-b', projectGroupId: 'g1', projectGroupOrder: 2 }),
      repo({ id: 'repo-a', projectGroupId: 'g1', projectGroupOrder: 1 }),
      repo({ id: 'repo-x', projectGroupId: 'g2' })
    ]
    expect(
      resolveProjectGroupDefaultWorkspaceId('g1', repos, {
        'repo-a': [worktree({ id: 'a::main', isMainWorktree: true })],
        'repo-b': [worktree({ id: 'b::main', isMainWorktree: true })],
        'repo-x': [worktree({ id: 'x::main', isMainWorktree: true })]
      })
    ).toBe('a::main')
  })

  it('skips members without workspaces', () => {
    const repos = [
      repo({ id: 'repo-a', projectGroupId: 'g1', projectGroupOrder: 1 }),
      repo({ id: 'repo-b', projectGroupId: 'g1', projectGroupOrder: 2 })
    ]
    expect(
      resolveProjectGroupDefaultWorkspaceId('g1', repos, {
        'repo-b': [worktree({ id: 'b::only' })]
      })
    ).toBe('b::only')
  })

  it('reports nothing for a group with no openable workspace', () => {
    expect(
      resolveProjectGroupDefaultWorkspaceId(
        'g1',
        [repo({ id: 'repo-a', projectGroupId: 'g1' })],
        {}
      )
    ).toBeNull()
  })
})
