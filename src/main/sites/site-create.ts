// Adopt an existing Site at this path, or mint a new one.
//
// `sites:create` used to throw when a record already pointed at the path. That is wrong after a
// re-clone: the folder was deleted, the record stayed, git wrote the checkout back, and create
// then refused the only site that path can belong to.

import { randomUUID } from 'node:crypto'
import {
  createEmptySiteEnvironment,
  DEFAULT_SITE_ENVIRONMENT_NAME,
  type Site
} from '../../shared/site-types'

export type SiteCreateStore = {
  findSiteByPath: (sitePath: string) => Site | null
  upsertSite: (site: Site) => Site
}

export type SiteCreateInput = {
  path: string
  displayName?: string
  repoId?: string | null
}

export function adoptOrCreateSite(store: SiteCreateStore, input: SiteCreateInput): Site {
  const existing = store.findSiteByPath(input.path)
  if (existing) {
    return existing
  }
  const segments = input.path.split(/[/\\]/)
  const fallbackName = segments.findLast((segment) => segment.length > 0) ?? input.path
  const site: Site = {
    id: randomUUID(),
    path: input.path,
    repoId: typeof input.repoId === 'string' ? input.repoId : null,
    displayName:
      typeof input.displayName === 'string' && input.displayName.trim().length > 0
        ? input.displayName.trim()
        : fallbackName,
    localWpRoot: '',
    localDomain: '',
    localStack: 'plain',
    dbUser: 'root',
    dbSocket: '',
    dbPort: null,
    phpVersion: '',
    activeEnvironment: DEFAULT_SITE_ENVIRONMENT_NAME,
    environments: { [DEFAULT_SITE_ENVIRONMENT_NAME]: createEmptySiteEnvironment() },
    notes: '',
    searchReplaceTimeoutSeconds: 600
  }
  return store.upsertSite(site)
}
