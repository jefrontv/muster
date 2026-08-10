// Where a muster:// link should set up a site that is not checked out yet.
//
// ocsites cloned straight into the user's configured projects folder rather than asking for a path,
// so a link for an unknown site was one action. This computes that target so the bind dialog can
// offer it directly instead of dead-ending on "choose a folder".

import type { SiteBindCandidate } from '../../../../shared/site-bind-types'

export type SiteBindSetupProposal = {
  /** `<primary root>/<repo folder>`, or empty when there is no root or no name to derive. */
  proposedPath: string
  /** The root's own folder name, for the action label (e.g. "Sites"). */
  proposedRootLabel: string
  /** True when no candidate is reachable on disk, so setting up fresh is the expected path. */
  needsFreshSetup: boolean
}

function lastSegment(value: string): string {
  // Strip trailing separators first so a path like `/Users/dev/Sites/` still yields `Sites`.
  return (
    value
      .replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .pop() ?? ''
  )
}

/** The folder name git itself will create: the clone URL's last segment, minus `.git`. */
function cloneFolderName(cloneUrl: string): string {
  return lastSegment(cloneUrl).replace(/\.git$/, '')
}

export function buildSiteBindSetupProposal(input: {
  /**
   * The one folder new checkouts belong in, from `siteRoots.primary()`.
   *
   * Not the scan list's first entry: that list is rendered in a stable alphabetical order and its
   * head is whichever path sorts first, not the folder holding the user's projects.
   */
  primaryRoot: string
  cloneUrl: string
  candidates: readonly SiteBindCandidate[]
}): SiteBindSetupProposal {
  const primaryRoot = input.primaryRoot
  // Prefer the name git will use; fall back to the stale record's folder so the proposed path reads
  // as the one the user expects even when the link carried no clonable repo name.
  const folderName = cloneFolderName(input.cloneUrl) || lastSegment(input.candidates[0]?.path ?? '')
  const proposedPath =
    primaryRoot.length > 0 && folderName.length > 0
      ? `${primaryRoot.replace(/[/\\]+$/, '')}/${folderName}`
      : ''
  return {
    proposedPath,
    proposedRootLabel: lastSegment(primaryRoot) || primaryRoot,
    needsFreshSetup: !input.candidates.some((candidate) => candidate.exists)
  }
}
