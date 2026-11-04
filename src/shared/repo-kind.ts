import type { Repo } from './types'

export function getRepoKind(repo: Pick<Repo, 'kind'>): 'git' | 'folder' {
  return repo.kind === 'folder' ? 'folder' : 'git'
}

export function isFolderRepo(repo: Pick<Repo, 'kind'>): boolean {
  return getRepoKind(repo) === 'folder'
}

export function isGitRepoKind(repo: Pick<Repo, 'kind'>): boolean {
  return getRepoKind(repo) === 'git'
}

/** Git panels apply: a git project, or a folder project backed by its own git root. */
export function hasGitFeatures(repo: Pick<Repo, 'kind' | 'gitBacked'>): boolean {
  return isGitRepoKind(repo) || repo.gitBacked === true
}

export function getRepoKindLabel(repo: Pick<Repo, 'kind'>): string {
  return isFolderRepo(repo) ? 'Folder' : 'Git'
}
