import { describe, expect, it } from 'vitest'
import {
  resolveCommitAreaPrimaryAction,
  type PrimaryActionInputs
} from './source-control-primary-action'
import { resolveCommitAllPaths } from './source-control-commit-all'
import type { GitStatusEntry } from '../../../../shared/types'

function inputs(overrides: Partial<PrimaryActionInputs> = {}): PrimaryActionInputs {
  return {
    stagedCount: 0,
    hasUnstagedChanges: true,
    hasStageableChanges: true,
    hasPartiallyStagedChanges: false,
    hasMessage: true,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: { hasUpstream: true, upstreamName: 'origin/main', ahead: 0, behind: 0 },
    commitAllFileCount: 4,
    ...overrides
  }
}

describe('resolveCommitAreaPrimaryAction Commit All', () => {
  it('offers Commit All with the file count when a message is typed and nothing is staged', () => {
    expect(resolveCommitAreaPrimaryAction(inputs())).toEqual({
      kind: 'commit',
      label: 'Commit All',
      title: 'Stage and commit 4 files',
      disabled: false,
      commitAll: true
    })
  })

  it('uses the singular tooltip for one file', () => {
    expect(resolveCommitAreaPrimaryAction(inputs({ commitAllFileCount: 1 })).title).toBe(
      'Stage and commit 1 file'
    )
  })

  it('keeps Stage All when there is no message yet', () => {
    const result = resolveCommitAreaPrimaryAction(inputs({ hasMessage: false }))
    expect(result.kind).toBe('stage')
    expect(result.commitAll).toBeUndefined()
  })

  it('commits only staged files once something is staged', () => {
    const result = resolveCommitAreaPrimaryAction(inputs({ stagedCount: 2 }))
    expect(result).toEqual({
      kind: 'commit',
      label: 'Commit',
      title: 'Commit staged changes',
      disabled: false
    })
  })

  it('still blocks on unresolved conflicts', () => {
    const result = resolveCommitAreaPrimaryAction(inputs({ hasUnresolvedConflicts: true }))
    expect(result.disabled).toBe(true)
    expect(result.commitAll).toBeUndefined()
    expect(result.title).toBe('Resolve conflicts before committing')
  })

  it('does not offer Commit All when the caller does not opt in', () => {
    const result = resolveCommitAreaPrimaryAction(inputs({ commitAllFileCount: undefined }))
    expect(result.kind).toBe('stage')
  })

  it('disables Commit All while a remote operation runs', () => {
    const result = resolveCommitAreaPrimaryAction(
      inputs({ isRemoteOperationActive: true, inFlightRemoteOpKind: 'fetch' })
    )
    expect(result.label).toBe('Commit All')
    expect(result.disabled).toBe(true)
  })
})

describe('resolveCommitAllPaths', () => {
  const entry = (path: string, area: GitStatusEntry['area']): GitStatusEntry =>
    ({ path, area, status: area === 'untracked' ? 'untracked' : 'modified' }) as GitStatusEntry

  it('includes tracked changes and untracked files, skipping unresolved conflicts', () => {
    const conflicted = {
      ...entry('conflict.ts', 'unstaged'),
      conflictStatus: 'unresolved'
    } as GitStatusEntry
    expect(
      resolveCommitAllPaths([entry('a.ts', 'unstaged'), conflicted], [entry('new.ts', 'untracked')])
    ).toEqual(['a.ts', 'new.ts'])
  })
})
