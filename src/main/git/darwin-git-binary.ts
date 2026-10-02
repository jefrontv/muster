// macOS: /usr/bin/git is an xcrun shim that costs ~14 ms per spawn; resolve the real binary behind it.
import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import path from 'node:path'

const XCRUN_SHIM_GIT = '/usr/bin/git'
const XCRUN_TIMEOUT_MS = 5_000

type DarwinGitBinaryDeps = {
  pathEnv: string
  isExecutable: (filePath: string) => boolean
  runXcrunFindGit: () => Promise<string>
}

function isExecutableFile(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function runXcrunFindGit(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/xcrun',
      ['-f', 'git'],
      { encoding: 'utf-8', timeout: XCRUN_TIMEOUT_MS },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout).trim()))
    )
  })
}

function findOnPath(command: string, deps: DarwinGitBinaryDeps): string | null {
  for (const dir of deps.pathEnv.split(path.delimiter)) {
    if (!path.isAbsolute(dir)) {
      continue
    }
    const candidate = path.join(dir, command)
    if (deps.isExecutable(candidate)) {
      return candidate
    }
  }
  return null
}

/** Returns the xcrun-resolved git when PATH lands on the shim, else bare `git` so PATH still wins. */
export async function resolveDarwinGitBinary(deps: DarwinGitBinaryDeps): Promise<string> {
  if (findOnPath('git', deps) !== XCRUN_SHIM_GIT) {
    return 'git'
  }
  try {
    const resolved = await deps.runXcrunFindGit()
    return path.isAbsolute(resolved) && deps.isExecutable(resolved) ? resolved : 'git'
  } catch {
    return 'git'
  }
}

type ProbeState = { pathEnv: string; binary: string | null }

let probe: ProbeState | null = null
let enabled = process.platform === 'darwin' && !process.env.VITEST

function startProbe(pathEnv: string): ProbeState {
  const state: ProbeState = { pathEnv, binary: null }
  probe = state
  void resolveDarwinGitBinary({ pathEnv, isExecutable: isExecutableFile, runXcrunFindGit }).then(
    (binary) => {
      // Why: PATH can change mid-probe (shell PATH hydration); a newer probe owns the cache.
      if (probe === state) {
        state.binary = binary
      }
    }
  )
  return state
}

/**
 * Binary for local git spawns. Bare `git` until the async probe settles, so no sync spawn on the
 * hot path. Re-probes when PATH changes.
 */
export function resolveLocalGitBinary(): string {
  if (!enabled) {
    return 'git'
  }
  const pathEnv = process.env.PATH ?? ''
  const state = probe && probe.pathEnv === pathEnv ? probe : startProbe(pathEnv)
  return state.binary ?? 'git'
}

/** Drop the cached binary when a spawn of it failed because it is gone (e.g. CLT uninstalled). */
export function noteLocalGitSpawnFailure(binary: string, error: unknown): void {
  if (!probe || probe.binary !== binary || binary === 'git') {
    return
  }
  const code = (error as { code?: unknown } | null)?.code
  if ((code === 'ENOENT' || code === 'EACCES') && !isExecutableFile(binary)) {
    probe = null
  }
}

/** Test-only: enable resolution under vitest and clear the cache. */
export function setDarwinGitBinaryResolutionForTests(next: boolean): void {
  enabled = next
  probe = null
}
