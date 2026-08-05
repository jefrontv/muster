import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import type { SiteSummary } from '../../../../shared/site-types'

/**
 * Maps a project (repo) checkout to its Site record. A repo owns a site when its path IS the
 * site's path, or when the repo lives at the site's WordPress subdirectory — LocalWP checkouts
 * open `<site>/app/public` as the project while the Site is keyed on the LocalWP root above it.
 */
export function findSiteForProject(
  sites: readonly SiteSummary[],
  projectPath: string | null | undefined
): SiteSummary | null {
  if (!projectPath) {
    return null
  }
  const projectKey = normalizeRuntimePathForComparison(projectPath)
  for (const summary of sites) {
    if (normalizeRuntimePathForComparison(summary.site.path) === projectKey) {
      return summary
    }
    const wpRoot = summary.site.localWpRoot
    if (
      wpRoot.length > 0 &&
      // '/' is safe cross-platform: normalization folds separators on both sides before comparing.
      normalizeRuntimePathForComparison(`${summary.site.path}/${wpRoot}`) === projectKey
    ) {
      return summary
    }
  }
  return null
}
