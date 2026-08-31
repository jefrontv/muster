import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import type { SiteSummary } from '../../../../shared/site-types'

/**
 * LocalWP's fixed WordPress subdirectory. Mirrors `localWpWordPressRoot` in shared/localwp-paths,
 * which is not imported here because it pulls in `node:path` and this module runs in the renderer.
 */
const LOCALWP_WORDPRESS_SUBPATH = 'app/public'

/**
 * Maps a project (repo) checkout to its Site record. A repo owns a site when its path IS the
 * site's path, or when the repo lives at the site's WordPress subdirectory — LocalWP checkouts
 * open `<site>/app/public` as the project while the Site is keyed on the LocalWP root above it.
 *
 * `app/public` is tried even when no subdirectory was recorded: a site imported into a
 * LocalWP-shaped folder can have an empty `localWpRoot` while its checkout still sits there, and
 * relying on the record alone left the Site tab hidden for every one of them.
 */
export function findSiteForProject(
  sites: readonly SiteSummary[],
  projectPath: string | null | undefined
): SiteSummary | null {
  if (!projectPath) {
    return null
  }
  const projectKey = normalizeRuntimePathForComparison(projectPath)
  const matches = (candidate: string): boolean =>
    normalizeRuntimePathForComparison(candidate) === projectKey

  // Two passes, because a site can be registered AT `<other>/app/public` in its own right. What the
  // record actually says must win over the convention, or that site would lose to its parent folder.
  for (const summary of sites) {
    const wpRoot = summary.site.localWpRoot
    // '/' is safe cross-platform: normalization folds separators on both sides before comparing.
    if (
      matches(summary.site.path) ||
      (wpRoot.length > 0 && matches(`${summary.site.path}/${wpRoot}`))
    ) {
      return summary
    }
  }
  for (const summary of sites) {
    if (matches(`${summary.site.path}/${LOCALWP_WORDPRESS_SUBPATH}`)) {
      return summary
    }
  }
  return null
}
