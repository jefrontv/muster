// Resolve / migrate a project path that points at a LocalWP site shell into app/public.
//
// LocalWP's managed folder is conf/logs/app; the WordPress (and usually git) root is app/public.
// Imports and already-registered folder projects must land there so terminals and the file tree
// open on the site, not Local's scaffolding.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { resolveLocalWpImportProjectPath } from '../../shared/localwp-paths'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type { Repo, WorktreeMeta } from '../../shared/types'
import { FOLDER_WORKSPACE_INSTANCE_SEPARATOR } from '../../shared/worktree-id'
import { getGitRepoRoot, getRepoName, isGitRepo } from '../git/repo'
import type { Store } from '../persistence'
import { rewriteWorkspaceSessionWorktreePath } from './localwp-workspace-session-rekey'

export { rewriteWorkspaceSessionWorktreePath } from './localwp-workspace-session-rekey'

// Why: repos:list + worktrees:list* hit every project on a timer. After the first pass this
// process, disk probes and rewrites are pure waste — cache "already evaluated" by repo id.
const localWpMigrationCheckedRepoIds = new Set<string>()

/** Test-only: clear the process-local migration check cache. */
export function resetLocalWpRepoPathMigrationCacheForTests(): void {
  localWpMigrationCheckedRepoIds.clear()
}

/** True when path is `…/app/public` by shape alone (no disk). */
function pathLooksLikeAppPublicRoot(dirPath: string): boolean {
  const normalized = path.normalize(dirPath)
  return path.basename(normalized) === 'public' && path.basename(path.dirname(normalized)) === 'app'
}

export type ResolvedLocalProjectImportPath = {
  path: string
  kind: 'git' | 'folder'
  displayNameSourcePath: string
  remappedToWordPressRoot: boolean
}

/**
 * Path + kind to use when importing a local folder as a project.
 * LocalWP site shells remap to app/public and always stay folder projects — "New workspace"
 * must create another workspace on the same site, not a git worktree (Local only serves one path).
 */
export function resolveLocalProjectImportPath(
  selectedPath: string,
  requestedKind: 'git' | 'folder'
): ResolvedLocalProjectImportPath {
  const localWp = resolveLocalWpImportProjectPath(selectedPath, existsSync)
  const projectPath = localWp.projectPath

  if (localWp.remappedToWordPressRoot) {
    return {
      path: projectPath,
      kind: 'folder',
      displayNameSourcePath: localWp.displayNameSourcePath,
      remappedToWordPressRoot: true
    }
  }

  if (requestedKind === 'git') {
    if (!isGitRepo(projectPath)) {
      return {
        path: projectPath,
        kind: 'git',
        displayNameSourcePath: projectPath,
        remappedToWordPressRoot: false
      }
    }
    return {
      path: getGitRepoRoot(projectPath),
      kind: 'git',
      displayNameSourcePath: projectPath,
      remappedToWordPressRoot: false
    }
  }

  return {
    path: projectPath,
    kind: 'folder',
    displayNameSourcePath: projectPath,
    remappedToWordPressRoot: false
  }
}

/**
 * Worktree ids embed `repoId::path`. When the project path moves into app/public, rekey meta so
 * the synthetic root doesn't stick to the old shell path. Folder workspace instances are dropped
 * when promoting to git — they are not real checkouts and would resurrect as ghost cards.
 */
export function rekeyWorktreeMetaForRepoPathChange(
  store: Store,
  repoId: string,
  previousPath: string,
  nextPath: string,
  options?: { dropFolderWorkspaceInstances?: boolean }
): void {
  if (previousPath === nextPath) {
    return
  }
  const previousPrefix = `${repoId}::${previousPath}`
  const nextPrefix = `${repoId}::${nextPath}`
  const allMeta = store.getAllWorktreeMeta()
  const moves: { from: string; to: string; meta: WorktreeMeta }[] = []
  for (const [worktreeId, meta] of Object.entries(allMeta)) {
    if (worktreeId !== previousPrefix && !worktreeId.startsWith(`${previousPrefix}::`)) {
      continue
    }
    if (
      options?.dropFolderWorkspaceInstances &&
      worktreeId.includes(FOLDER_WORKSPACE_INSTANCE_SEPARATOR)
    ) {
      store.removeWorktreeMeta(worktreeId)
      continue
    }
    moves.push({
      from: worktreeId,
      to: `${nextPrefix}${worktreeId.slice(previousPrefix.length)}`,
      meta
    })
  }
  for (const move of moves) {
    store.setWorktreeMeta(move.to, move.meta)
    store.removeWorktreeMeta(move.from)
  }
}

/**
 * Self-heal repos still pointed at a LocalWP site shell, or already on app/public as kind:git.
 * LocalWP projects stay folder mode so New workspace creates a same-path workspace, not a worktree.
 *
 * Hot path: after the first evaluation per repo id this process, returns immediately (no disk).
 * Folder projects already at `…/app/public` skip disk on the first check too.
 */
export function migrateLocalWpRepoPathIfNeeded(store: Store, repo: Repo): Repo {
  if (repo.connectionId) {
    return repo
  }
  if (localWpMigrationCheckedRepoIds.has(repo.id)) {
    return repo
  }

  // Why: ~all LocalWP fleets after migration are folder@app/public; basename checks only.
  if (repo.kind === 'folder' && pathLooksLikeAppPublicRoot(repo.path)) {
    localWpMigrationCheckedRepoIds.add(repo.id)
    return repo
  }

  const resolved = resolveLocalProjectImportPath(
    repo.path,
    repo.kind === 'folder' ? 'folder' : 'git'
  )
  if (!resolved.remappedToWordPressRoot) {
    localWpMigrationCheckedRepoIds.add(repo.id)
    return repo
  }

  const pathKey = normalizeRuntimePathForComparison(repo.path)
  const nextPathKey = normalizeRuntimePathForComparison(resolved.path)
  const kindChanged = repo.kind !== resolved.kind
  if (pathKey === nextPathKey && !kindChanged) {
    localWpMigrationCheckedRepoIds.add(repo.id)
    return repo
  }

  const previousPath = repo.path
  const updates: {
    path: string
    kind: 'git' | 'folder'
    displayName?: string
  } = {
    path: resolved.path,
    kind: resolved.kind
  }
  // Why: only rewrite the name when it still looks like the default folder basename ("public"
  // after a manual path edit, or the site shell name which is already correct).
  if (repo.displayName === getRepoName(repo.path) || repo.displayName === 'public') {
    updates.displayName = getRepoName(resolved.displayNameSourcePath)
  }

  const migrated = store.updateRepo(repo.id, updates) ?? repo
  if (migrated.path !== previousPath) {
    const previousPrefix = `${repo.id}::${previousPath}`
    const nextPrefix = `${repo.id}::${migrated.path}`
    rekeyWorktreeMetaForRepoPathChange(store, repo.id, previousPath, migrated.path, {
      // Why: drop only when we were promoting away from folder instances; LocalWP stays folder.
      dropFolderWorkspaceInstances: false
    })
    // Why: session still holds shell-path worktree ids; without this rewrite, startup hydrates
    // the old rows, the authoritative scan returns only app/public ids, and hydration purge
    // deletes the old ones one-by-one (workspaces flash then vanish).
    if (
      typeof store.getWorkspaceSession === 'function' &&
      typeof store.setWorkspaceSession === 'function'
    ) {
      const session = store.getWorkspaceSession()
      store.setWorkspaceSession(
        rewriteWorkspaceSessionWorktreePath(session, previousPrefix, nextPrefix)
      )
    }
  }
  localWpMigrationCheckedRepoIds.add(repo.id)
  return migrated
}

/**
 * Run LocalWP path migration across the whole store once. Shared by repos:list and
 * worktrees:list* so we don't re-walk/re-stat on every concurrent list.
 */
export function migrateAllLocalWpRepoPathsIfNeeded(store: Store): {
  repos: Repo[]
  anyChanged: boolean
} {
  let anyChanged = false
  const repos = store.getRepos().map((repo) => {
    const beforePath = repo.path
    const beforeKind = repo.kind
    const migrated = migrateLocalWpRepoPathIfNeeded(store, repo)
    if (migrated.path !== beforePath || migrated.kind !== beforeKind) {
      anyChanged = true
    }
    return migrated
  })
  return { repos, anyChanged }
}
