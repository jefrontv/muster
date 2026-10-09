import { describe, expect, it } from 'vitest'
import { resolveDropdownItems, type DropdownActionInputs } from './source-control-dropdown-items'
import { omitPrimaryDuplicateRows, toDropdownMenuNodes } from './source-control-dropdown-layout'

function inputs(overrides: Partial<DropdownActionInputs> = {}): DropdownActionInputs {
  return {
    stagedCount: 1,
    hasUnstagedChanges: false,
    hasStageableChanges: false,
    hasPartiallyStagedChanges: false,
    hasMessage: true,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: { hasUpstream: true, upstreamName: 'origin/feature', ahead: 1, behind: 0 },
    rebaseBaseRef: 'origin/main',
    ...overrides
  }
}

function kinds(overrides: Partial<DropdownActionInputs> = {}): string[] {
  return resolveDropdownItems(inputs(overrides)).map((entry) => entry.kind)
}

describe('dropdown layout', () => {
  it('shows Publish Branch after the review rows only for an unpublished branch', () => {
    expect(kinds()).not.toContain('publish')
    const unpublished = kinds({ upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 } })
    expect(unpublished.slice(unpublished.indexOf('create_pr'))).toEqual([
      'create_pr',
      'push_create_pr',
      'publish',
      'separator',
      'force_push'
    ])
  })

  it('keeps Publish Branch visible while upstream status is still loading', () => {
    expect(kinds({ upstreamStatus: undefined })).toContain('publish')
  })

  it('nests Fast-forward and Rebase under More after the remote rows', () => {
    const nodes = toDropdownMenuNodes(resolveDropdownItems(inputs()))
    const labels = nodes.map((node) =>
      node.kind === 'submenu' ? `more:${node.items.length}` : node.kind
    )
    expect(labels.slice(0, 11)).toEqual([
      'commit',
      'commit_push',
      'commit_sync',
      'undo_commit',
      'separator',
      'push',
      'pull',
      'sync',
      'fetch',
      'more:2',
      'separator'
    ])
    const more = nodes.find((node) => node.kind === 'submenu')
    expect(more?.kind === 'submenu' && more.items.map((item) => item.label)).toEqual([
      'Fast-forward',
      'Rebase from origin/main'
    ])
  })

  it('keeps blocked rows visible with their reason', () => {
    const items = resolveDropdownItems(
      inputs({ upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 } })
    )
    const pull = items.find((entry) => entry.kind === 'pull')
    expect(pull?.kind === 'pull' && pull.disabled).toBe(true)
    expect(pull?.kind === 'pull' && pull.title).toBe('Publish the branch first to pull commits')
  })

  it('appends abort rows after Force Push during a rebase', () => {
    const all = kinds({ conflictOperation: 'rebase' })
    expect(all.slice(-3)).toEqual(['force_push', 'separator', 'abort_rebase'])
  })
})

describe('omitPrimaryDuplicateRows', () => {
  it('drops the Commit row when the primary button is Commit', () => {
    const entries = omitPrimaryDuplicateRows(resolveDropdownItems(inputs()), 'commit')
    expect(entries.map((entry) => entry.kind).slice(0, 3)).toEqual([
      'commit_push',
      'commit_sync',
      'undo_commit'
    ])
  })

  it('keeps the Commit row when the primary is another action', () => {
    const entries = omitPrimaryDuplicateRows(resolveDropdownItems(inputs()), 'push')
    expect(entries[0]?.kind).toBe('commit')
  })

  it('never leaves a leading or doubled separator', () => {
    const entries = omitPrimaryDuplicateRows(
      [
        { kind: 'commit', label: 'Commit', title: '', disabled: false },
        { kind: 'separator' },
        { kind: 'separator' },
        { kind: 'fetch', label: 'Fetch', title: '', disabled: false },
        { kind: 'separator' }
      ],
      'commit'
    )
    expect(entries.map((entry) => entry.kind)).toEqual(['fetch'])
  })
})
