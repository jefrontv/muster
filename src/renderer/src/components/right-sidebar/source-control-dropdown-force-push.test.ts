import { describe, expect, it } from 'vitest'
import {
  resolveDropdownItems,
  type DropdownActionInputs,
  type DropdownItem
} from './source-control-dropdown-items'
import { resolveForcePushConfirmation } from './source-control-force-push-confirmation'

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

function forcePushItem(overrides: Partial<DropdownActionInputs>): DropdownItem {
  const item = resolveDropdownItems(inputs(overrides)).find(
    (entry): entry is DropdownItem => entry.kind === 'force_push'
  )
  if (!item) {
    throw new Error('force_push row missing')
  }
  return item
}

describe('force push dropdown row', () => {
  it('sits last in the remote group, after Publish Branch and before abort rows', () => {
    const kinds = resolveDropdownItems(
      inputs({
        conflictOperation: 'merge',
        upstreamStatus: { hasUpstream: true, ahead: 1, behind: 0 }
      })
    ).map((entry) => entry.kind)
    const forceIndex = kinds.indexOf('force_push')
    expect(kinds[forceIndex - 1]).toBe('publish')
    expect(kinds.slice(forceIndex + 1)).toEqual(['separator', 'abort_merge'])
  })

  it('is always marked destructive', () => {
    expect(
      forcePushItem({ upstreamStatus: { hasUpstream: true, ahead: 2, behind: 0 } }).variant
    ).toBe('destructive')
    expect(forcePushItem({ upstreamStatus: undefined }).variant).toBe('destructive')
  })

  it('is disabled when there is nothing to force push', () => {
    const item = forcePushItem({
      upstreamStatus: { hasUpstream: true, upstreamName: 'origin/main', ahead: 0, behind: 3 }
    })
    expect(item.title).toBe('Nothing to force push to origin/main')
    expect(item.disabled).toBe(true)
  })

  it('stays enabled with local commits to push', () => {
    expect(
      forcePushItem({ upstreamStatus: { hasUpstream: true, ahead: 1, behind: 2 } }).disabled
    ).toBe(false)
  })

  it('stays enabled for unpublished and still-loading branches', () => {
    expect(
      forcePushItem({ upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 } }).disabled
    ).toBe(false)
    expect(forcePushItem({ upstreamStatus: undefined }).disabled).toBe(false)
  })
})

describe('resolveForcePushConfirmation', () => {
  it('skips the confirm when the remote has nothing the branch lacks', () => {
    expect(resolveForcePushConfirmation({ hasUpstream: true, ahead: 2, behind: 0 })).toBeNull()
    expect(resolveForcePushConfirmation({ hasUpstream: false, ahead: 0, behind: 0 })).toBeNull()
    expect(resolveForcePushConfirmation(undefined)).toBeNull()
  })

  it('names the upstream and the remote-only commit count', () => {
    expect(
      resolveForcePushConfirmation({
        hasUpstream: true,
        upstreamName: 'origin/staging',
        ahead: 1,
        behind: 2
      })
    ).toEqual({
      title: 'Force push and replace remote commits?',
      description:
        "origin/staging has 2 commits that aren't on your branch. Force pushing deletes them from the remote.",
      confirmLabel: 'Force Push',
      confirmVariant: 'destructive'
    })
  })

  it('uses singular copy for one commit and falls back when the upstream name is unknown', () => {
    expect(
      resolveForcePushConfirmation({ hasUpstream: true, ahead: 1, behind: 1 })?.description
    ).toBe(
      "The remote branch has 1 commit that isn't on your branch. Force pushing deletes it from the remote."
    )
  })

  it('skips the confirm when the remote only has older copies of local commits', () => {
    expect(
      resolveForcePushConfirmation({
        hasUpstream: true,
        upstreamName: 'origin/feature',
        ahead: 3,
        behind: 3,
        behindCommitsArePatchEquivalent: true
      })
    ).toBeNull()
  })

  it('confirms when the remote has commits that are not copies of local ones', () => {
    expect(
      resolveForcePushConfirmation({
        hasUpstream: true,
        upstreamName: 'origin/feature',
        ahead: 3,
        behind: 3,
        behindCommitsArePatchEquivalent: false
      })
    ).not.toBeNull()
  })
})
