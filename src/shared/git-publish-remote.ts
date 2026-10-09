// Shared by local git (main) and the SSH relay so first publish picks the same remote on every host.

type RunGit = (args: string[]) => Promise<{ stdout: string }>

export type GitPublishRemoteResolution =
  | { remote: string }
  | { needsChoice: true; remotes: string[] }

export const NO_PUBLISH_REMOTE_MESSAGE =
  'This repository has no remote. Add one, then publish the branch.'
export const PUBLISH_REMOTE_CHOICE_REQUIRED_MESSAGE =
  'This repository has several remotes. Publish from Source Control to choose one.'

export function parseRemoteNames(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function resolvePublishRemoteFromList(
  remotes: readonly string[]
): GitPublishRemoteResolution {
  if (remotes.length === 1) {
    return { remote: remotes[0] }
  }
  if (remotes.includes('origin')) {
    return { remote: 'origin' }
  }
  return { needsChoice: true, remotes: [...remotes] }
}

// Where a branch with no upstream would publish; `configuredRemote` is the host's own push-target lookup.
export async function resolvePublishRemoteWithGit(
  runGit: RunGit,
  configuredRemote: string | null
): Promise<GitPublishRemoteResolution> {
  if (configuredRemote) {
    return { remote: configuredRemote }
  }
  const { stdout } = await runGit(['remote'])
  return resolvePublishRemoteFromList(parseRemoteNames(stdout))
}

// Push destination for a branch with no configured upstream or push target.
export async function resolveDefaultPublishDestination(runGit: RunGit): Promise<string[]> {
  const resolution = await resolvePublishRemoteWithGit(runGit, null)
  if ('remote' in resolution) {
    return [resolution.remote, 'HEAD']
  }
  // Why: callers that can ask the user resolve the remote first and pass an explicit push target.
  throw new Error(
    resolution.remotes.length === 0
      ? NO_PUBLISH_REMOTE_MESSAGE
      : PUBLISH_REMOTE_CHOICE_REQUIRED_MESSAGE
  )
}
