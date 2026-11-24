// Which space a workspace's pages live in: one per repo, or per project group for folder workspaces.

const REPO_PREFIX = 'repo:'
const GROUP_PREFIX = 'group:'
const MAX_ID = 200

export function pagesScopeKeyForRepo(repoId: string): string {
  return REPO_PREFIX + repoId
}

export function pagesScopeKeyForProjectGroup(projectGroupId: string): string {
  return GROUP_PREFIX + projectGroupId
}

export function isPagesScopeKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_ID + GROUP_PREFIX.length) {
    return false
  }
  const id = value.startsWith(REPO_PREFIX)
    ? value.slice(REPO_PREFIX.length)
    : value.startsWith(GROUP_PREFIX)
      ? value.slice(GROUP_PREFIX.length)
      : ''
  return id.length > 0 && [...id].every((ch) => ch.charCodeAt(0) >= 0x20)
}
