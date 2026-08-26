// Puts every site folder on disk into the sidebar, in one pass.
//
// Two steps that used to need two separate user actions: a folder found under a configured root is
// only a *candidate* until it has a Site record, and a Site is only a path until it also has a Repo
// (the sidebar lists repos, not sites). Adopting had to be clicked per folder, then "Add to sidebar"
// linked whatever had records — so a freshly-scanned root produced nothing until every row was
// clicked first.
//
// This composes both, which makes it usable from two triggers with identical behaviour: the button,
// and the roots watcher when the user has asked for it to happen automatically.
//
// Idempotent throughout. adoptOrCreateSite returns the existing record for a path rather than
// minting a duplicate, and linkSitesToRepos dedupes on a normalized path, so re-running is a no-op
// once everything is present — which is what makes it safe to fire on every watcher event.

import type { SiteSidebarSyncResult } from '../../shared/site-types'
import type { Store } from '../persistence'
import { discoverSiteCandidates } from './site-candidate-discovery'
import { adoptOrCreateSite } from './site-create'
import { linkSitesToRepos, type AddRepoFn } from './site-repo-link'
import { derivePrimarySiteRoot, deriveSiteRoots } from './site-roots-watcher'

export type SiteSidebarSyncDeps = {
  /** Injected so the compose order can be tested without a disk or a repo tree. */
  discover?: typeof discoverSiteCandidates
  addRepo?: AddRepoFn
  /** Supplied by the caller that already holds a live watcher, whose set is authoritative. */
  roots?: string[]
}

export async function addDiscoveredSitesToSidebar(
  store: Store,
  deps: SiteSidebarSyncDeps = {}
): Promise<SiteSidebarSyncResult> {
  const discover = deps.discover ?? discoverSiteCandidates
  const discovery = await discover({
    roots: deps.roots ?? deriveSiteRoots(store),
    primaryRoot: derivePrimarySiteRoot(store),
    // Already-configured checkouts are not candidates; discovery filters them out itself.
    configuredPaths: store.listSites().map((site) => site.path)
  })

  let adopted = 0
  for (const candidate of discovery.candidates) {
    // Counts records actually minted, not candidates seen: a path that already had a site (the
    // race where discovery predates an adopt) must not inflate the number reported to the user.
    const before = store.findSiteByPath(candidate.path)
    adoptOrCreateSite(store, { path: candidate.path, displayName: candidate.displayName })
    if (!before) {
      adopted += 1
    }
  }

  const linked = await linkSitesToRepos(store, deps.addRepo)
  return { ...linked, adopted }
}
