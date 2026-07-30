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

/**
 * True when `dirPath` looks like Local's WordPress root (`…/app/public` with wp-config.php).
 * Used to keep LocalWP projects in folder mode after import so "New workspace" does not open
 * Create worktree.
 */
export function isLocalWpWordPressRootPath(
  dirPath: string,
  pathExists: (targetPath: string) => boolean
): boolean {
  const normalized = path.normalize(dirPath)
  if (path.basename(normalized) !== 'public') {
    return false
  }
  if (path.basename(path.dirname(normalized)) !== 'app') {
    return false
  }
  return pathExists(path.join(normalized, 'wp-config.php'))
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
  // Why: wp-config under app/public is the same LocalWP signal site-candidate-discovery uses;
  // a bare app/public (Laravel, etc.) must not steal the project root.
  if (!pathExists(localWpConfigPath(selectedPath))) {
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
