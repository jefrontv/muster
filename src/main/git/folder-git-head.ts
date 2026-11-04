import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { Repo } from '../../shared/types'

export type FolderGitHead = { head: string; branch: string }

const NO_GIT_HEAD: FolderGitHead = { head: '', branch: '' }

function resolveGitDir(folderPath: string): string | null {
  const marker = join(folderPath, '.git')
  try {
    // A `.git` file points elsewhere (linked worktree or submodule).
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(marker, 'utf8'))?.[1]?.trim()
    if (!pointer) {
      return null
    }
    return isAbsolute(pointer) ? pointer : resolve(folderPath, pointer)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EISDIR' ? marker : null
  }
}

/** Branch and detached head of a git-backed folder, from `.git/HEAD` without spawning git. */
export function readFolderGitHead(
  repo: Pick<Repo, 'path' | 'gitBacked' | 'connectionId'>
): FolderGitHead {
  if (repo.gitBacked !== true || repo.connectionId) {
    return NO_GIT_HEAD
  }
  const gitDir = resolveGitDir(repo.path)
  if (!gitDir) {
    return NO_GIT_HEAD
  }
  try {
    const content = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    const ref = /^ref:\s*(\S+)$/.exec(content)?.[1]
    if (ref) {
      return { head: '', branch: ref }
    }
    return /^[0-9a-f]{40,64}$/i.test(content) ? { head: content, branch: '' } : NO_GIT_HEAD
  } catch {
    return NO_GIT_HEAD
  }
}
