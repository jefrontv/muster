import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildAppImageCliWrapper, quoteShell } from './appimage-cli-wrapper'
import { getBundledLauncherPath } from './cli-installer'

const SHIM_DIR_NAME = 'linux-cli-shim'

// Why: rewriting the shim on every PTY spawn is wasted fs work; the target only
// changes with the install itself, so one successful write per process is enough.
// Failures are NOT cached so a transient fs error retries on the next spawn.
const ensuredShimDirs = new Map<string, string>()

export type LinuxTerminalCliShimOptions = {
  userDataPath: string
  /** Test seam — defaults to the packaged resources root. */
  resourcesPath?: string | null
  /** Test seam — defaults to $APPIMAGE (set only when running from an AppImage). */
  appImagePath?: string | null
}

// Why: agent-facing surfaces (skills, dispatch preambles, CLI hints) invoke `muster`, which may not
// be registered in ~/.local/bin. Prepending this userData-scoped dir to managed-PTY PATH makes it
// resolve inside Muster terminals without touching the user's own shells.
export function ensureLinuxTerminalCliShimDir(options: LinuxTerminalCliShimOptions): string | null {
  const cached = ensuredShimDirs.get(options.userDataPath)
  if (cached !== undefined) {
    return cached
  }

  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  if (!resourcesPath) {
    return null
  }
  const script = buildLinuxCliForwarderScript(
    resourcesPath,
    options.appImagePath ?? process.env.APPIMAGE ?? null
  )
  if (!script) {
    return null
  }

  const shimDir = join(options.userDataPath, SHIM_DIR_NAME)
  const shimPath = join(shimDir, 'muster')
  try {
    if (readShim(shimPath) !== script) {
      mkdirSync(shimDir, { recursive: true })
      writeFileSync(shimPath, script, 'utf8')
    }
    // Why: always re-assert the exec bit — a shim written by an older run (or
    // restored from backup) with mode stripped would fail every agent CLI call.
    chmodSync(shimPath, 0o755)
  } catch {
    return null
  }
  ensuredShimDirs.set(options.userDataPath, shimDir)
  return shimDir
}

/** Script that execs the CLI: the stable AppImage when running from one, else the bundled launcher. */
export function buildLinuxCliForwarderScript(
  resourcesPath: string,
  appImagePath: string | null
): string | null {
  if (appImagePath) {
    // Why: an AppImage mounts resources under an ephemeral FUSE path per launch,
    // so the script must exec the stable outer AppImage.
    return buildAppImageCliWrapper(appImagePath)
  }
  const launcher = getBundledLauncherPath('linux', resourcesPath)
  // Why: never write a script pointing at a missing launcher; command-not-found is clearer.
  if (!launcher || !existsSync(launcher)) {
    return null
  }
  return `#!/usr/bin/env bash\nexec ${quoteShell(launcher)} "$@"\n`
}

function readShim(shimPath: string): string | null {
  try {
    return readFileSync(shimPath, 'utf8')
  } catch {
    return null
  }
}
