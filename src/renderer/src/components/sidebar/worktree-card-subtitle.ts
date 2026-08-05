// Subtitle text under the workspace card title: branch identity for git rows, folder identity for
// folder projects. Pure so the legacy and experimental card styles share one selection/de-dupe rule.

import {
  getRuntimePathBasename,
  normalizeRuntimePathForComparison
} from '../../../../shared/cross-platform-path'

type SiteIdentitySource = {
  /** The site checkout directory. */
  path: string
  /** Subpath inside `path` where WordPress lives; 'app/public' under LocalWP. */
  localWpRoot: string
  /** e.g. acme.local */
  localDomain: string
}

/** Suppress a subtitle that just repeats the visible card title. */
export function dedupeWorktreeCardSubtitle(
  subtitle: string | null | undefined,
  visibleTitle: string
): string | null {
  if (subtitle == null) {
    return null
  }
  const trimmedSubtitle = subtitle.trim()
  if (!trimmedSubtitle) {
    return null
  }
  // Why: trim only for the comparison; callers may rely on the original spacing when rendering.
  return trimmedSubtitle === visibleTitle.trim() ? null : subtitle
}

/** LocalWP projects land on `<site>/app/public`; that basename identifies nothing on its own. */
export function pathLooksLikeAppPublicRoot(workspacePath: string): boolean {
  return /(^|\/)app\/public$/.test(normalizeRuntimePathForComparison(workspacePath))
}

/**
 * Resolve the Site record owning `workspacePath` — the site checkout itself, or its LocalWP
 * WordPress root (`<site.path>/<site.localWpRoot>`) — and return that site's local domain.
 */
export function findSiteLocalDomainForWorkspacePath(
  workspacePath: string,
  sites: readonly { site: SiteIdentitySource }[]
): string | null {
  const target = normalizeRuntimePathForComparison(workspacePath)
  if (!target) {
    return null
  }
  for (const { site } of sites) {
    if (!site.path) {
      continue
    }
    const wpRoot = site.localWpRoot.trim()
    const matches =
      normalizeRuntimePathForComparison(site.path) === target ||
      (wpRoot.length > 0 && normalizeRuntimePathForComparison(`${site.path}/${wpRoot}`) === target)
    if (matches) {
      return site.localDomain.trim() || null
    }
  }
  return null
}

/**
 * Subtitle for a folder-project card. Normal folders show their basename (unless it repeats the
 * title); LocalWP-shaped `app/public` roots show the matched Site's local domain or nothing —
 * never the meaningless 'public'.
 */
export function getFolderWorkspaceSubtitle(args: {
  workspacePath: string
  visibleTitle: string
  /** Matched Site's local domain when the workspace resolves to a Site; null otherwise. */
  siteLocalDomain: string | null
}): string | null {
  if (pathLooksLikeAppPublicRoot(args.workspacePath)) {
    return dedupeWorktreeCardSubtitle(args.siteLocalDomain, args.visibleTitle)
  }
  return dedupeWorktreeCardSubtitle(getRuntimePathBasename(args.workspacePath), args.visibleTitle)
}
