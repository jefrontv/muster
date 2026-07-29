// Resolving "which site does this ActiveCollab project belong to" in one place, because the
// answer has four distinct outcomes and every caller must handle all of them the same way.

import { activeCollabProjectSiteKey } from '../../../shared/activecollab-project-site'
import type { Site, SiteSummary } from '../../../shared/site-types'

export type ActiveCollabSiteBinding =
  | { kind: 'unbound' }
  /** Bound to a site that has since been removed; the id is kept so the UI can explain itself. */
  | { kind: 'missing-site'; siteId: string }
  /** A site is only a folder until it is opened as a repo, and a worktree needs a repo. */
  | { kind: 'needs-repo'; site: Site }
  | { kind: 'ready'; site: Site; repoId: string }

export function resolveActiveCollabSiteBinding(args: {
  bindings: Record<string, string>
  sites: readonly SiteSummary[]
  instanceUrl: string | null | undefined
  projectId: number
}): ActiveCollabSiteBinding {
  const siteId = args.bindings[activeCollabProjectSiteKey(args.instanceUrl, args.projectId)]
  if (!siteId) {
    return { kind: 'unbound' }
  }
  const found = args.sites.find((summary) => summary.site.id === siteId)
  if (!found) {
    return { kind: 'missing-site', siteId }
  }
  const repoId = found.site.repoId
  return repoId
    ? { kind: 'ready', site: found.site, repoId }
    : { kind: 'needs-repo', site: found.site }
}
