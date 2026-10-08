import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/types'
import {
  getEntryContextMenuDiscardLabel,
  getEntryContextMenuIndexLabel,
  resolveEntryContextMenuActions
} from './source-control-entry-context-menu-actions'

function entry(overrides: Partial<GitStatusEntry>): GitStatusEntry {
  return { path: 'src/app.ts', status: 'modified', area: 'unstaged', ...overrides }
}

describe('resolveEntryContextMenuActions', () => {
  it('offers Stage and Discard for an unstaged modification', () => {
    expect(resolveEntryContextMenuActions(entry({}))).toEqual({
      indexAction: 'stage',
      discardAction: 'discard',
      canOpenFile: true
    })
  })

  it('offers Unstage and no discard for a staged row', () => {
    expect(resolveEntryContextMenuActions(entry({ area: 'staged' }))).toEqual({
      indexAction: 'unstage',
      discardAction: null,
      canOpenFile: true
    })
  })

  it('labels untracked discard as delete', () => {
    const actions = resolveEntryContextMenuActions(
      entry({ area: 'untracked', status: 'untracked' })
    )
    expect(actions.indexAction).toBe('stage')
    expect(actions.discardAction).toBe('delete')
    expect(getEntryContextMenuDiscardLabel('delete')).toBe('Delete File')
  })

  it('restores a deleted file and cannot open its missing working copy', () => {
    const actions = resolveEntryContextMenuActions(entry({ status: 'deleted' }))
    expect(actions.discardAction).toBe('restore')
    expect(actions.canOpenFile).toBe(false)
  })

  it('hides index and discard actions for unresolved conflicts', () => {
    const actions = resolveEntryContextMenuActions(
      entry({ conflictStatus: 'unresolved', conflictKind: 'both_modified' })
    )
    expect(actions.indexAction).toBeNull()
    expect(actions.discardAction).toBeNull()
  })

  it('treats submodule-internal rows as read-only', () => {
    const actions = resolveEntryContextMenuActions(entry({ submoduleRoot: 'vendor/lib' }))
    expect(actions.indexAction).toBeNull()
    expect(actions.discardAction).toBeNull()
  })

  it('uses menu-style labels', () => {
    expect(getEntryContextMenuIndexLabel('stage')).toBe('Stage Changes')
    expect(getEntryContextMenuIndexLabel('unstage')).toBe('Unstage Changes')
    expect(getEntryContextMenuDiscardLabel('discard')).toBe('Discard Changes')
    expect(getEntryContextMenuDiscardLabel('restore')).toBe('Restore File')
  })
})
