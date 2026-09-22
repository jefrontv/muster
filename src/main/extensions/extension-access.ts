// Whether this user can reach a private entry's source.
//
// acf-json lives in a private Bitbucket repo, so some people can install it and some cannot. The
// probe exists so the second group sees "you do not have access to this repository" instead of an
// install that fails halfway through with a git error.
//
// It is advisory in one direction only. A denial greys the row; an inconclusive answer (no SSH
// agent, a timeout, git missing) leaves the row enabled, because guessing "denied" from a missing
// agent would lock out a machine that works perfectly well. Being wrong toward "let them try" costs
// a failed command with git's own message. Being wrong the other way hides a tool from someone
// entitled to it, and they have no way to discover that it was ever there.

import { streamCommand } from '../lib/stream-command'
import type { ExtensionAccessSpec } from '../../shared/extension-catalog-types'

const ACCESS_TIMEOUT_MS = 6_000

/** Undefined is the honest answer when the probe could not decide. */
export type ExtensionAccessResult = boolean | undefined

export type ExtensionAccessEnv = {
  checkGitRemote: (remote: string) => Promise<ExtensionAccessResult>
}

async function defaultCheckGitRemote(remote: string): Promise<ExtensionAccessResult> {
  const result = await streamCommand('git', ['ls-remote', '--heads', remote], {
    timeoutMs: ACCESS_TIMEOUT_MS,
    maxBytes: 64 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' }
  })
  if (result.code === 0) {
    return true
  }
  if (result.timedOut) {
    return undefined
  }
  const stderr = result.stderr.toLowerCase()
  // Why match on the message rather than the exit code: git exits 128 for "denied", "no such
  // repository" and "could not read from remote" alike, and only the first two are about access.
  if (
    stderr.includes('permission denied') ||
    stderr.includes('access denied') ||
    stderr.includes('repository not found') ||
    stderr.includes('authentication failed') ||
    stderr.includes('does not exist')
  ) {
    return false
  }
  return undefined
}

export function createDefaultExtensionAccessEnv(): ExtensionAccessEnv {
  return { checkGitRemote: defaultCheckGitRemote }
}

const sessionCache = new Map<string, Promise<ExtensionAccessResult>>()

/**
 * Cached for the life of the process: access does not change while the app is open, and the probe
 * is a network round trip that would otherwise run on every focus rescan.
 */
export function probeExtensionAccess(
  spec: ExtensionAccessSpec,
  env: ExtensionAccessEnv = createDefaultExtensionAccessEnv()
): Promise<ExtensionAccessResult> {
  const cached = sessionCache.get(spec.remote)
  if (cached) {
    return cached
  }
  const pending = env.checkGitRemote(spec.remote).catch(() => undefined)
  sessionCache.set(spec.remote, pending)
  return pending
}

export function clearExtensionAccessCache(): void {
  sessionCache.clear()
}
