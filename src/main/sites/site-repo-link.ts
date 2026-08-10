// Makes imported sites show up in the sidebar.
//
// A Site is just a path until it is also a Repo — the sidebar lists repos, not sites. Importing
// 154 presets and landing on "No workspaces found" is the wrong first impression, so every site
// whose checkout is actually on disk becomes a project automatically.
//
// Idempotent: addLocalRepoFromPath dedupes on a normalized path, so re-running relinks rather than
// duplicating, and a site already linked to a repo that still exists is skipped outright.
//
// "Still exists" is the load-bearing half. Removing a project from the sidebar deletes the repo but
// leaves the site's repoId pointing at it, and a truthiness check on that field then skips the site
// forever — "Add to sidebar" reports success and nothing appears, with no way to recover from the
// UI. A repoId that no longer resolves is treated as no link at all.

import { existsSync } from 'node:fs'
import type { SiteRepoLinkResult } from '../../shared/site-types'
import { addLocalRepoFromPath } from '../ipc/repos'
import type { Store } from '../persistence'

export type { SiteRepoLinkResult }

/** Injected so the link rules can be tested without a real repo tree on disk. */
export type AddRepoFn = typeof addLocalRepoFromPath

export async function linkSitesToRepos(
  store: Store,
  addRepo: AddRepoFn = addLocalRepoFromPath
): Promise<SiteRepoLinkResult> {
  const result: SiteRepoLinkResult = { eligible: 0, added: 0, linked: 0, skipped: [] }

  for (const site of store.listSites()) {
    if (site.repoId && store.getRepo(site.repoId)) {
      continue
    }
    if (!site.path || !existsSync(site.path)) {
      // Not an error: a site on an unmounted volume keeps its config and links on a later run.
      continue
    }
    result.eligible += 1

    // Non-git checkouts still belong in the sidebar — Orca models them as folder repos.
    const outcome = await addRepo(store, site.path, 'git').catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error)
    }))
    const resolved = 'error' in outcome ? await addRepo(store, site.path, 'folder') : outcome

    if ('error' in resolved) {
      result.skipped.push({ path: site.path, reason: resolved.error })
      continue
    }

    store.updateSite(site.id, { repoId: resolved.repo.id })
    if (resolved.alreadyExisted) {
      result.linked += 1
    } else {
      result.added += 1
    }
  }

  return result
}
