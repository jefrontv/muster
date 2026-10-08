// Why: stage/unstage/discard all take .git/index.lock; overlapping clicks on one worktree made the second fail with "index.lock exists".
const tailsByWorktree = new Map<string, Promise<void>>()

const ignore = (): void => {}

/** Run `write` after every earlier index write queued for the same worktree has settled. */
export function enqueueGitIndexWrite<T>(worktreeKey: string, write: () => Promise<T>): Promise<T> {
  const previous = tailsByWorktree.get(worktreeKey) ?? Promise.resolve()
  const result = previous.then(write)
  // Why: a failed write must not block or fail the writes queued behind it.
  const tail = result.then(ignore, ignore)
  tailsByWorktree.set(worktreeKey, tail)
  void tail.then(() => {
    if (tailsByWorktree.get(worktreeKey) === tail) {
      tailsByWorktree.delete(worktreeKey)
    }
  })
  return result
}
