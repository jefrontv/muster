import { describe, expect, it } from 'vitest'
import {
  resolveDropdownItems,
  type DropdownActionInputs,
  type DropdownItem
} from './source-control-dropdown-items'

function inputs(overrides: Partial<DropdownActionInputs> = {}): DropdownActionInputs {
  return {
    stagedCount: 0,
    hasUnstagedChanges: false,
    hasStageableChanges: false,
    hasPartiallyStagedChanges: false,
    hasMessage: false,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: undefined,
    ...overrides
  }
}

describe('resolveDropdownItems undo_commit', () => {
  function undoItem(overrides: Partial<DropdownActionInputs> = {}): DropdownItem {
    const item = resolveDropdownItems(
      inputs({ upstreamStatus: { hasUpstream: true, ahead: 1, behind: 0 }, ...overrides })
    ).find((entry) => entry.kind === 'undo_commit')
    if (!item || item.kind === 'separator') {
      throw new Error('undo_commit row missing')
    }
    return item as DropdownItem
  }

  it('is enabled with nothing staged', () => {
    expect(undoItem().disabled).toBe(false)
  })

  it('is disabled on an unborn branch', () => {
    const item = undoItem({ hasHeadCommit: false })
    expect(item.disabled).toBe(true)
    expect(item.title).toBe('No commits to undo')
  })

  it('is disabled while a rebase is in progress', () => {
    const item = undoItem({ conflictOperation: 'rebase' })
    expect(item.disabled).toBe(true)
    expect(item.title).toBe('Finish or abort the rebase first')
  })

  it('is disabled while another operation is running', () => {
    expect(undoItem({ isRemoteOperationActive: true }).disabled).toBe(true)
  })
})
