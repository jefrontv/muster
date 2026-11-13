// A site added with Add Project gets its Site record too, so its Site tab shows without a trip to
// the Sites page to adopt the folder there.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import {
  isLocalWpWordPressRootPath,
  localWpConfigPath,
  localWpSitePathFromWordPressRoot
} from '../../shared/localwp-paths'
import type { Site } from '../../shared/site-types'
import type { Repo } from '../../shared/types'
import { normalizeConfiguredSiteRoots } from './site-roots-config'
import { adoptOrCreateSite, type SiteCreateStore } from './site-create'

export type SiteForAddedProjectStore = SiteCreateStore & {
  getConfiguredSiteRoots: () => readonly string[]
  updateSite: (siteId: string, updates: Partial<Omit<Site, 'id'>>) => Site | null
}

/**
 * The folder whose Site record should own this project, or null when it is not a site. WordPress
 * is a site wherever it sits; a plain git checkout only inside a site folder the user chose, since
 * most repos are not sites.
 */
export function siteFolderForProject(
  projectPath: string,
  configuredRoots: readonly string[],
  exists: (target: string) => boolean
): string | null {
  if (isLocalWpWordPressRootPath(projectPath, exists)) {
    return localWpSitePathFromWordPressRoot(projectPath)
  }
  if (exists(localWpConfigPath(projectPath)) || exists(path.join(projectPath, 'wp-config.php'))) {
    return projectPath
  }
  const parent = normalizeRuntimePathForComparison(path.dirname(projectPath))
  const inSiteFolder = configuredRoots.some(
    (root) => normalizeRuntimePathForComparison(root) === parent
  )
  return inSiteFolder && exists(path.join(projectPath, '.git')) ? projectPath : null
}

export function adoptSiteForProject(
  store: SiteForAddedProjectStore,
  repo: Pick<Repo, 'id' | 'path' | 'displayName' | 'connectionId'>,
  exists: (target: string) => boolean = existsSync
): Site | null {
  if (repo.connectionId) {
    return null
  }
  const sitePath = siteFolderForProject(
    repo.path,
    normalizeConfiguredSiteRoots(store.getConfiguredSiteRoots()),
    exists
  )
  if (!sitePath) {
    return null
  }
  const site = adoptOrCreateSite(store, {
    path: sitePath,
    displayName: repo.displayName,
    repoId: repo.id
  })
  return site.repoId ? site : (store.updateSite(site.id, { repoId: repo.id }) ?? site)
}

/** Catches up projects added before this existed; cheap enough to run on every start. */
export function adoptSitesForProjects(
  store: SiteForAddedProjectStore & { getRepos: () => readonly Repo[] },
  exists: (target: string) => boolean = existsSync
): void {
  for (const repo of store.getRepos()) {
    adoptSiteForProject(store, repo, exists)
  }
}
