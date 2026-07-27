// The branch a folder project has checked out on disk, for seeding a blank workspace name.
//
// The composer normally reads the branch off the selected project's main worktree row. A LocalWP
// site keeps its checkout at `app/public`, so Orca classifies it as a plain folder and that row
// carries no branch — the seed used to fall straight through to a random marine-creature name.
// The precedence that consumes this lives in shared/workspace-name (resolveWorkspaceSeedBranchName).

import { useEffect, useState } from 'react'

/**
 * The branch checked out under `dirPath`, or `''` while it is unknown. Pass `null` to probe nothing
 * — the caller decides which projects are worth a disk read.
 *
 * Nothing waits on this. The composer renders with `''` and picks the branch up on the round trip,
 * so a slow, missing or rejected probe leaves the seed exactly where it was: unresolved. The answer
 * is keyed by the path it was asked about, so a reply that lands after the user switched projects
 * is discarded on read rather than written over the new selection.
 */
export function useFolderProjectHeadBranch(dirPath: string | null): string {
  const [probed, setProbed] = useState<{ path: string; branch: string } | null>(null)

  useEffect(() => {
    if (dirPath === null) {
      return
    }
    // Optional: an older preload has no such channel, and a missing branch is a supported answer.
    const pending = window.api.repoHeadBranch?.probe({ paths: [dirPath] })
    if (pending === undefined) {
      return
    }
    let cancelled = false
    void pending.then(
      (branches) => {
        if (!cancelled) {
          setProbed({ path: dirPath, branch: branches[dirPath] ?? '' })
        }
      },
      () => {
        // Best effort by construction; an unreachable main process costs one unresolved seed.
      }
    )
    return () => {
      cancelled = true
    }
  }, [dirPath])

  return probed?.path === dirPath ? probed.branch : ''
}
