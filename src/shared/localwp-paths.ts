// Where LocalWP puts things inside a site folder. Pure path arithmetic, kept out of localwp-host so
// that reading the layout does not drag in the child-process and socket machinery beside it —
// mirrors shared/wsl-paths.ts, which wsl.ts re-exports for the same reason.

import path from 'node:path'

/** LocalWP nests the WordPress root two levels under the site folder it manages. */
export function localWpWordPressRoot(sitePath: string): string {
  return path.join(sitePath, 'app', 'public')
}

/** LocalWP layout marker: WordPress config lives under app/public, not the site folder. */
export function localWpConfigPath(sitePath: string): string {
  return path.join(localWpWordPressRoot(sitePath), 'wp-config.php')
}

type RelativeExists = (...segments: string[]) => boolean

/**
 * Any one marks a WordPress root. wp-config.php alone was too strict: it is often gitignored, sits
 * one level up, or lives under web/ (Bedrock), and a fresh clone has none.
 */
export const WORDPRESS_ROOT_MARKERS: readonly (readonly string[])[] = [
  ['wp-config.php'],
  ['wp-load.php'],
  ['wp-includes'],
  ['wp-content'],
  ['web', 'wp-config.php'],
  ['config', 'application.php']
]

/** Local's own folders beside app/. Any one, plus app/public, marks a LocalWP site folder. */
export const LOCALWP_SHELL_MARKERS: readonly (readonly string[])[] = [
  ['conf'],
  ['logs'],
  ['app', 'wp-config.php']
]

export function looksLikeWordPressRootAt(has: RelativeExists): boolean {
  return WORDPRESS_ROOT_MARKERS.some((marker) => has(...marker))
}

/** `has` resolves against the candidate site folder. */
export function isLocalWpSiteShellAt(has: RelativeExists): boolean {
  if (looksLikeWordPressRootAt((...segments) => has('app', 'public', ...segments))) {
    return true
  }
  return has('app', 'public') && LOCALWP_SHELL_MARKERS.some((marker) => has(...marker))
}

export function looksLikeWordPressRoot(
  dirPath: string,
  pathExists: (targetPath: string) => boolean
): boolean {
  return looksLikeWordPressRootAt((...segments) => pathExists(path.join(dirPath, ...segments)))
}

/**
 * A LocalWP site folder: app/public plus WordPress inside it or Local's conf/ or logs/ beside it.
 * A bare app/public (Laravel, etc.) is not enough.
 */
export function isLocalWpSiteShell(
  sitePath: string,
  pathExists: (targetPath: string) => boolean
): boolean {
  return isLocalWpSiteShellAt((...segments) => pathExists(path.join(sitePath, ...segments)))
}

/** True when `dirPath` is `…/app/public` by shape alone (no disk). */
export function pathLooksLikeLocalWpWordPressRoot(dirPath: string): boolean {
  const normalized = path.normalize(dirPath)
  return path.basename(normalized) === 'public' && path.basename(path.dirname(normalized)) === 'app'
}

/**
 * True when `dirPath` is Local's WordPress root (`…/app/public` of a LocalWP site folder).
 * Used to keep LocalWP projects in folder mode after import so "New workspace" does not open
 * Create worktree.
 */
export function isLocalWpWordPressRootPath(
  dirPath: string,
  pathExists: (targetPath: string) => boolean
): boolean {
  if (!pathLooksLikeLocalWpWordPressRoot(dirPath)) {
    return false
  }
  return isLocalWpSiteShell(localWpSitePathFromWordPressRoot(dirPath), pathExists)
}

/** Site folder for a WordPress root at `…/app/public` (two levels up). */
export function localWpSitePathFromWordPressRoot(wordPressRoot: string): string {
  return path.dirname(path.dirname(path.normalize(wordPressRoot)))
}

export type LocalWpImportProjectPath = {
  /** Path terminals/agents should open as the project root. */
  projectPath: string
  /** Folder whose basename is the human project name (the Local site folder, not `public`). */
  displayNameSourcePath: string
  /** True when the selected path was a LocalWP site folder and we dropped into app/public. */
  remappedToWordPressRoot: boolean
}

/**
 * When adding an existing LocalWP site folder as a project, land on app/public so the workspace is
 * the WordPress root instead of Local's site shell (conf/, logs/, app/). Pure: callers supply
 * existence so main/runtime/tests can use real disk or fakes.
 */
export function resolveLocalWpImportProjectPath(
  selectedPath: string,
  pathExists: (targetPath: string) => boolean
): LocalWpImportProjectPath {
  // Already on the WordPress root — keep it, name from the Local site folder.
  if (isLocalWpWordPressRootPath(selectedPath, pathExists)) {
    return {
      projectPath: selectedPath,
      displayNameSourcePath: localWpSitePathFromWordPressRoot(selectedPath),
      remappedToWordPressRoot: true
    }
  }
  const wordPressRoot = localWpWordPressRoot(selectedPath)
  // Why: same LocalWP signal site-candidate-discovery uses; a bare app/public must not steal the root.
  if (!isLocalWpSiteShell(selectedPath, pathExists)) {
    return {
      projectPath: selectedPath,
      displayNameSourcePath: selectedPath,
      remappedToWordPressRoot: false
    }
  }
  return {
    projectPath: wordPressRoot,
    displayNameSourcePath: selectedPath,
    remappedToWordPressRoot: true
  }
}
