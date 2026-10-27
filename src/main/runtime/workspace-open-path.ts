import { realpathSync, statSync } from 'node:fs'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'

export type { RuntimeWorkspaceOpenPathResult } from '../../shared/runtime-types'

export type OpenPathWorkspaceCandidate = {
  id: string
  repoId: string
  path: string
}

function isSameOrInside(target: string, root: string): boolean {
  if (target === root) {
    return true
  }
  return target.startsWith(root.endsWith('/') ? root : `${root}/`)
}

/** Deepest workspace whose folder is `targetPath` or contains it; a worktree beats its parent repo. */
export function findDeepestWorkspaceForPath<T extends OpenPathWorkspaceCandidate>(
  candidates: readonly T[],
  targetPaths: readonly string[]
): T | null {
  const targets = targetPaths.map(normalizeRuntimePathForComparison)
  let best: { candidate: T; depth: number; isRoot: boolean } | null = null
  for (const candidate of candidates) {
    const root = normalizeRuntimePathForComparison(candidate.path)
    if (!targets.some((target) => isSameOrInside(target, root))) {
      continue
    }
    // Why: folder workspace instances share the repo path; prefer the root workspace on a tie.
    const isRoot = candidate.id === `${candidate.repoId}::${candidate.path}`
    if (
      !best ||
      root.length > best.depth ||
      (root.length === best.depth && isRoot && !best.isRoot)
    ) {
      best = { candidate, depth: root.length, isRoot }
    }
  }
  return best?.candidate ?? null
}

/** Throws a user-facing error unless `path` is a readable local folder; returns its real path. */
export function resolveLocalOpenPath(path: string): string {
  let isDirectory: boolean
  try {
    isDirectory = statSync(path).isDirectory()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new Error(
      code === 'ENOENT' ? `No such folder: ${path}` : `Cannot read ${path} (${code ?? 'unknown'})`
    )
  }
  if (!isDirectory) {
    throw new Error(`Not a folder: ${path}`)
  }
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}
