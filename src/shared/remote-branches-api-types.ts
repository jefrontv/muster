// Renderer view of the remote branch listing used by muster:// site setup to pick a clone branch.

export type RemoteBranchList = {
  /** False when the remote could not be read (offline, no credentials, bad URL). */
  ok: boolean
  branches: string[]
  /** The remote's HEAD branch; null when unknown. */
  defaultBranch: string | null
}

export type RemoteBranchesApi = {
  list: (args: { url: string }) => Promise<RemoteBranchList>
}
