// Kill a spawned command and everything it started.
//
// Why this exists: killSpawnedCommandTree (src/main/git/runner.ts:311) degrades to a bare
// child.kill() on macOS/Linux, which signals only the direct child. Cancelling a site run that
// way orphans the ssh, mysqldump, rsync and npm grandchildren — they keep the remote connection
// and the database open long after the UI says "cancelled". On POSIX the fix is to signal the
// process GROUP (-pid), which only works when the child was spawned detached; streamCommand
// always spawns that way.

import type { ChildProcess } from 'node:child_process'
import { terminateWindowsProcessTree } from '../windows-process-tree-kill'

/** SIGTERM first so ssh can close its channel; SIGKILL once this elapses. */
export const DEFAULT_KILL_TREE_GRACE_MS = 2_000

export type KillCommandTreeOptions = {
  graceMs?: number
}

/** Where a signal can still land: the child's process group, or just the child. */
type KillTarget = 'group' | 'pid'

/** True once Node has reaped the child, at which point its pid is recyclable and unsafe to signal. */
function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

/** Best-effort signal. A dead, reparented or foreign target is not an error here. */
function trySignal(target: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(target, signal)
    return true
  } catch {
    return false
  }
}

/** Signal 0 probes for existence: prefer the group, fall back to a non-detached child. */
function probeTarget(pid: number): KillTarget | null {
  if (trySignal(-pid, 0)) {
    return 'group'
  }
  return trySignal(pid, 0) ? 'pid' : null
}

function waitForExit(child: ChildProcess, graceMs: number): Promise<void> {
  if (hasExited(child)) {
    return Promise.resolve()
  }
  const { promise, resolve } = Promise.withResolvers<void>()
  const finish = (): void => {
    clearTimeout(timer)
    child.off('exit', finish)
    resolve()
  }
  const timer = setTimeout(finish, graceMs)
  // Why: a pending grace timer must not hold the event loop open past app quit.
  timer.unref?.()
  child.once('exit', finish)
  return promise
}

/**
 * Terminate `child` and every descendant. Never throws and always resolves, so a cancel path can
 * await it without a second failure mode.
 */
export async function killCommandTree(
  child: ChildProcess,
  options: KillCommandTreeOptions = {}
): Promise<void> {
  const pid = child.pid
  if (!pid || hasExited(child)) {
    return
  }
  if (process.platform === 'win32') {
    await terminateWindowsProcessTree(pid)
    return
  }
  const target = probeTarget(pid)
  if (!target) {
    return
  }
  const signalTarget = target === 'group' ? -pid : pid
  trySignal(signalTarget, 'SIGTERM')
  await waitForExit(child, options.graceMs ?? DEFAULT_KILL_TREE_GRACE_MS)
  // A non-detached child has no group to sweep, and its pid is recyclable once reaped.
  if (target === 'pid' && hasExited(child)) {
    return
  }
  // Why: the leader exiting does NOT kill its group — a grandchild that ignored SIGTERM is still
  // in there. Re-probe before escalating so we never SIGKILL an id that is empty or already reused.
  if (!trySignal(signalTarget, 0)) {
    return
  }
  trySignal(signalTarget, 'SIGKILL')
}
