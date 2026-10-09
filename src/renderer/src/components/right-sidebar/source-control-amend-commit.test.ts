import { describe, expect, it } from 'vitest'
import {
  resolveAmendCommitConfirmation,
  resolveAmendCommitItem,
  type AmendCommitItemInputs
} from './source-control-amend-commit'
import { resolveDropdownItems, type DropdownActionInputs } from './source-control-dropdown-items'

function itemInputs(overrides: Partial<AmendCommitItemInputs> = {}): AmendCommitItemInputs {
  return {
    globalBusy: false,
    hasHeadCommit: true,
    conflictOperation: 'unknown',
    hasUnresolvedConflicts: false,
    hasMessage: true,
    ...overrides
  }
}

describe('resolveAmendCommitItem', () => {
  it('is enabled with a message and a HEAD commit', () => {
    const item = resolveAmendCommitItem(itemInputs())
    expect(item.label).toBe('Commit (Amend)')
    expect(item.disabled).toBe(false)
    expect(item.title).toBe('Replace the last commit with the staged changes and this message')
  })

  it('stays enabled with an empty box so it can load the last message', () => {
    const item = resolveAmendCommitItem(itemInputs({ hasMessage: false }))
    expect(item.disabled).toBe(false)
    expect(item.title).toBe('Load the last commit message to edit, then amend')
  })

  it('is disabled on an unborn branch', () => {
    const item = resolveAmendCommitItem(itemInputs({ hasHeadCommit: false }))
    expect(item.disabled).toBe(true)
    expect(item.title).toBe('No commit to amend')
  })

  it('is disabled during a merge or rebase', () => {
    for (const conflictOperation of ['merge', 'rebase'] as const) {
      const item = resolveAmendCommitItem(itemInputs({ conflictOperation }))
      expect(item.disabled).toBe(true)
      expect(item.title).toBe(`Finish or abort the ${conflictOperation} first`)
    }
  })

  it('is disabled while another operation runs', () => {
    expect(resolveAmendCommitItem(itemInputs({ globalBusy: true })).disabled).toBe(true)
  })
})

describe('resolveAmendCommitConfirmation', () => {
  it('confirms when HEAD is already on the upstream', () => {
    const confirmation = resolveAmendCommitConfirmation({
      hasUpstream: true,
      upstreamName: 'origin/x',
      ahead: 0,
      behind: 0
    })
    expect(confirmation?.description).toBe(
      'This commit is already on origin/x. Amending it only changes your local branch, and your next push will need Force Push.'
    )
  })

  it('skips the confirm for local-only commits or unpublished branches', () => {
    expect(
      resolveAmendCommitConfirmation({
        hasUpstream: true,
        upstreamName: 'origin/x',
        ahead: 1,
        behind: 0
      })
    ).toBeNull()
    expect(resolveAmendCommitConfirmation({ hasUpstream: false, ahead: 0, behind: 0 })).toBeNull()
    expect(resolveAmendCommitConfirmation(undefined)).toBeNull()
  })
})

describe('dropdown Commit (Amend) row', () => {
  it('sits right after Commit in the commit group', () => {
    const inputs: DropdownActionInputs = {
      stagedCount: 1,
      hasUnstagedChanges: false,
      hasStageableChanges: false,
      hasPartiallyStagedChanges: false,
      hasMessage: true,
      hasUnresolvedConflicts: false,
      isCommitting: false,
      isRemoteOperationActive: false,
      upstreamStatus: { hasUpstream: true, ahead: 1, behind: 0 }
    }
    const kinds = resolveDropdownItems(inputs).map((entry) => entry.kind)
    expect(kinds.slice(0, 5)).toEqual([
      'commit',
      'commit_amend',
      'commit_push',
      'commit_sync',
      'undo_commit'
    ])
  })
})
