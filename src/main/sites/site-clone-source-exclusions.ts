// Which of the repositories a git host offers are already here, and so must not be offered again.
//
// The picker's only action is "clone this into the sites folder". A repo the user already has is
// therefore worse than noise: picking it cannot succeed. The rule lives in main rather than the
// renderer so there is one authoritative answer whichever window asks, and so it can be tested
// without a UI.
//
// Two signals, because neither alone covers the store. A canonical remote key is exact but only
// about half of the recorded repos carry one — `gitRemoteIdentity` is captured when a repo is added
// and the older records predate it. A directory name is always available and, for this one
// question, is not a heuristic at all; see `isAlreadyPresent`.
//
// Pure by construction: no filesystem, no store, no clock. The caller gathers the paths.

import { getRuntimePathBasename } from '../../shared/cross-platform-path'
import { normalizeGitRemoteUrl } from '../../shared/git-remote-identity'
import type { CloneSourceRepo } from '../../shared/site-clone-source-types'

export type ExistingSiteFootprint = {
  /** canonicalKey values from every known repo's gitRemoteIdentity. */
  remoteKeys: ReadonlySet<string>
  /** Lowercased directory basenames already occupied under the roots (sites, repos, on-disk folders). */
  occupiedNames: ReadonlySet<string>
}

/** Only the two fields the footprint reads; anything wider would drag `Repo` into a pure module. */
type FootprintRepo = {
  path: string
  gitRemoteIdentity?: { canonicalKey: string } | null
}

function addOccupiedName(names: Set<string>, path: string): void {
  const name = getRuntimePathBasename(path).toLowerCase()
  // An empty basename means the path was empty or all separators. Keeping '' out of the set is what
  // lets `isAlreadyPresent` skip a guard on a repo whose full name has no slug.
  if (name.length > 0) {
    names.add(name)
  }
}

/**
 * Three sources on purpose. Repos and sites are what the store knows; discovered paths are what is
 * on disk but not recorded yet — a folder nobody has adopted still occupies the name a clone wants.
 */
export function buildExistingSiteFootprint(input: {
  repos: readonly FootprintRepo[]
  sitePaths: readonly string[]
  discoveredPaths: readonly string[]
}): ExistingSiteFootprint {
  const remoteKeys = new Set<string>()
  const occupiedNames = new Set<string>()

  for (const repo of input.repos) {
    const canonicalKey = repo.gitRemoteIdentity?.canonicalKey ?? ''
    if (canonicalKey.length > 0) {
      remoteKeys.add(canonicalKey)
    }
    addOccupiedName(occupiedNames, repo.path)
  }
  for (const sitePath of input.sitePaths) {
    addOccupiedName(occupiedNames, sitePath)
  }
  for (const discoveredPath of input.discoveredPaths) {
    addOccupiedName(occupiedNames, discoveredPath)
  }

  return { remoteKeys, occupiedNames }
}

/**
 * Either signal is sufficient.
 *
 * The remote key is the precise one: `normalizeGitRemoteUrl` folds ssh against https, a `.git`
 * suffix and host case into the same string `gitRemoteIdentity.canonicalKey` was built from, so a
 * hit means this is literally the same remote.
 *
 * The name check is not a fuzzy fallback. A clone lands at `<primaryRoot>/<slug>`, so a slug that is
 * already an occupied directory name is a guaranteed collision — git would refuse to clone into it.
 * Offering the row would only produce an error the user cannot act on.
 *
 * The deliberate trade: a repo with the same name under a different owner is hidden even though it
 * is genuinely a different repo. That is the correct outcome, because cloning it to that path would
 * fail for exactly the same reason. Surfacing it would require a destination the picker does not
 * offer to choose.
 */
export function isAlreadyPresent(repo: CloneSourceRepo, footprint: ExistingSiteFootprint): boolean {
  const canonicalKey = normalizeGitRemoteUrl(repo.cloneUrl)
  if (canonicalKey !== null && footprint.remoteKeys.has(canonicalKey)) {
    return true
  }
  // The folder a clone would create: the segment after the last '/' in `owner/name`.
  const slug = repo.fullName.slice(repo.fullName.lastIndexOf('/') + 1).toLowerCase()
  return footprint.occupiedNames.has(slug)
}
