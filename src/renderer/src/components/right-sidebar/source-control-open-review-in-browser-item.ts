import { translate } from '@/i18n/i18n'
import type { DropdownItem } from './source-control-dropdown-items'

export type OpenReviewInBrowserItemInputs = {
  manualReviewUrl: string | null | undefined
  globalBusy: boolean
  upstreamLoading: boolean
  hasUpstream: boolean
  hasCurrentBranch: boolean
  hasOpenHostedReview: boolean
}

function resolveBlockedHint(inputs: OpenReviewInBrowserItemInputs): string | null {
  if (inputs.hasOpenHostedReview) {
    return translate(
      'auto.components.right.sidebar.source.control.open.review.in.browser.existing',
      'A pull request already exists'
    )
  }
  if (inputs.manualReviewUrl) {
    return null
  }
  if (inputs.upstreamLoading) {
    return translate(
      'auto.components.right.sidebar.source.control.open.review.in.browser.checking',
      'Checking branch status…'
    )
  }
  if (!inputs.hasCurrentBranch) {
    return translate(
      'auto.components.right.sidebar.source.control.open.review.in.browser.noBranch',
      'Check out a branch first'
    )
  }
  if (!inputs.hasUpstream) {
    return translate(
      'auto.components.right.sidebar.source.control.open.review.in.browser.unpublished',
      'Publish Branch first'
    )
  }
  return translate(
    'auto.components.right.sidebar.source.control.open.review.in.browser.noLink',
    'No pull request link for this remote'
  )
}

// Why: providers without in-app review creation (Bitbucket) get a working link to their create-PR page instead of two dead rows.
export function resolveOpenReviewInBrowserItem(
  inputs: OpenReviewInBrowserItemInputs
): DropdownItem {
  const blockedHint = resolveBlockedHint(inputs)
  return {
    kind: 'open_review_in_browser',
    label: translate(
      'auto.components.right.sidebar.source.control.open.review.in.browser.label',
      'Open Pull Request in Browser'
    ),
    title:
      blockedHint ??
      translate(
        'auto.components.right.sidebar.source.control.open.review.in.browser.title',
        'Open the new pull request page on the remote'
      ),
    hint: inputs.globalBusy ? undefined : (blockedHint ?? undefined),
    disabled: inputs.globalBusy || blockedHint !== null
  }
}
