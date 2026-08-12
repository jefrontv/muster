import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../../shared/types'
import { resolveProjectDefaultWorkspaceId } from './palette-project-activation'

function worktree(partial: Partial<Worktree> & { id: string }): Worktree {
  return { isMainWorktree: false, isArchived: false, ...partial } as Worktree
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
