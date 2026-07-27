// The renderer's view of the on-disk head-branch probe. Lives in shared/ (like
// site-clone-sources-api-types.ts) because the preload type surface is compiled into the browser
// project and must not reach into main, where the filesystem reads live.

export type RepoHeadBranchApi = {
  /**
   * Short branch names for the given project directories, keyed by the path asked for. Best effort
   * and infallible: a directory with no repository, an unreadable one, or a detached HEAD is absent
   * from the map rather than an error, because every caller treats "no branch" the same way.
   */
  probe: (args: { paths: string[] }) => Promise<Record<string, string>>
}
