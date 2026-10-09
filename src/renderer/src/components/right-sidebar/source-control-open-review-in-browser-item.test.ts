import { describe, expect, it } from 'vitest'
import {
  resolveDropdownItems,
  type DropdownActionInputs,
  type DropdownItem
} from './source-control-dropdown-items'
import type { HostedReviewCreationEligibility } from '../../../../shared/hosted-review'

const BITBUCKET_URL =
  'https://bitbucket.org/acme/site/pull-requests/new?source=feature%2Fx&dest=main'

function creation(
  overrides: Partial<HostedReviewCreationEligibility> = {}
): HostedReviewCreationEligibility {
  return {
    provider: 'bitbucket',
    review: null,
    canCreate: false,
    blockedReason: 'unsupported_provider',
    nextAction: null,
    reviewLookupOutcome: 'unavailable',
    ...overrides
  }
}

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
    upstreamStatus: { hasUpstream: true, ahead: 0, behind: 0 },
    hostedReviewCreation: creation(),
    manualReviewUrl: BITBUCKET_URL,
    ...overrides
  }
}

function findItem(entries: ReturnType<typeof resolveDropdownItems>, kind: string): DropdownItem {
  const item = entries.find((entry) => entry.kind === kind)
  if (!item || item.kind === 'separator') {
    throw new Error(`missing ${kind}`)
  }
  return item
}

describe('open review in browser dropdown row', () => {
  it('replaces Create PR and Push before PR for providers without in-app creation', () => {
    const kinds = resolveDropdownItems(inputs()).map((entry) => entry.kind)
    expect(kinds).toContain('open_review_in_browser')
    expect(kinds).not.toContain('create_pr')
    expect(kinds).not.toContain('push_create_pr')
    expect(kinds[kinds.indexOf('open_review_in_browser') - 1]).toBe('separator')
  })

  it('is enabled with no hint when a review link exists', () => {
    const item = findItem(resolveDropdownItems(inputs()), 'open_review_in_browser')
    expect(item.label).toBe('Open Pull Request in Browser')
    expect(item.disabled).toBe(false)
    expect(item.hint).toBeUndefined()
  })

  it('is disabled with an inline reason when the branch is unpublished', () => {
    const item = findItem(
      resolveDropdownItems(
        inputs({
          upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 },
          manualReviewUrl: null
        })
      ),
      'open_review_in_browser'
    )
    expect(item.disabled).toBe(true)
    expect(item.hint).toBe('Publish Branch first')
  })

  it('is disabled when a pull request is already open', () => {
    const item = findItem(
      resolveDropdownItems(inputs({ prState: 'open' })),
      'open_review_in_browser'
    )
    expect(item.disabled).toBe(true)
    expect(item.hint).toBe('A pull request already exists')
  })

  it('keeps the create rows for supported providers and while eligibility loads', () => {
    for (const hostedReviewCreation of [
      creation({ provider: 'github', blockedReason: null, canCreate: true }),
      undefined
    ]) {
      const kinds = resolveDropdownItems(inputs({ hostedReviewCreation })).map(
        (entry) => entry.kind
      )
      expect(kinds).toContain('create_pr')
      expect(kinds).toContain('push_create_pr')
      expect(kinds).not.toContain('open_review_in_browser')
    }
  })

  it('hides review rows for a remote on no known review host', () => {
    const kinds = resolveDropdownItems(
      inputs({
        hostedReviewCreation: creation({ provider: 'unsupported' }),
        manualReviewUrl: null
      })
    ).map((entry) => entry.kind)
    expect(kinds).not.toContain('open_review_in_browser')
    expect(kinds).not.toContain('create_pr')
    expect(kinds).not.toContain('push_create_pr')
  })
})
