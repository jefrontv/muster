/**
 * Why: a repo reached over SSH runs the Muster CLI through the relay shim, which
 * is always deployed as plain `muster`. Local platform command overrides (e.g.
 * `muster.cmd` on Windows) must not be applied to those remotes.
 * `connectionId` is the SSH signal; WSL and local stay false.
 */
export function repoIsRemote(repo: { connectionId?: string | null }): boolean {
  return Boolean(repo.connectionId)
}
