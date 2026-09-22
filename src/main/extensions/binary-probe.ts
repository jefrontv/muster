// Finds an executable a catalog entry depends on, and reads its version without starting it.
//
// Generalised from the ActiveCollab MCP's own probe, which learned the two lessons that matter: a
// GUI app's inherited PATH routinely omits ~/.local/bin even though the user's shell has it, and a
// pipx console script is a symlink, so stat (which follows it) is the honest existence check.
//
// Version reading is deliberately subprocess-free. Running an unknown binary to ask its version is
// a real cost on a probe that fires on every window focus, and it is a real risk when the binary is
// half-installed. pipx records its version in a metadata file, and anything installed by npm sits
// next to a package.json — between them that covers every entry we ship.

import { accessSync, constants, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, parse } from 'node:path'

export type BinaryProbeResult = {
  found: boolean
  /** The path as invoked, which is what a harness config should name. */
  path: string | null
  /** Symlinks resolved, which is where the version metadata lives. */
  realPath: string | null
  version: string | null
  versionSource: 'pipx' | 'package-json' | null
}

export type BinaryProbeEnv = {
  homeDir: string
  platform: NodeJS.Platform
  pathEntries: readonly string[]
  isExecutableFile: (path: string) => boolean
  realPath: (path: string) => string | null
  readText: (path: string) => string | null
  /** Entries of a directory, or [] when it cannot be read. Used to enumerate nvm's node versions. */
  listDirectory: (path: string) => string[]
}

export function createDefaultBinaryProbeEnv(): BinaryProbeEnv {
  return {
    homeDir: homedir(),
    platform: process.platform,
    pathEntries: (process.env.PATH ?? '').split(delimiter).filter((entry) => entry.length > 0),
    isExecutableFile: (path) => {
      try {
        if (!statSync(path).isFile()) {
          return false
        }
        accessSync(path, constants.X_OK)
        return true
      } catch {
        return false
      }
    },
    realPath: (path) => {
      try {
        return realpathSync(path)
      } catch {
        return null
      }
    },
    readText: (path) => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
    listDirectory: (path) => {
      try {
        return readdirSync(path)
      } catch {
        return []
      }
    }
  }
}

/**
 * Bin directories a GUI app's inherited PATH routinely lacks but the user's shell has.
 *
 * This is the single most common reason a working install reports as missing. pipx's `~/.local/bin`
 * was the known case; npm's global prefix is the one that caught us out, because under nvm it lives
 * at `~/.nvm/versions/node/<version>/bin` and nothing outside a login shell knows that.
 */
function fallbackBinDirectories(env: BinaryProbeEnv): string[] {
  const directories = [
    join(env.homeDir, '.local', 'bin'),
    join(env.homeDir, '.bun', 'bin'),
    join(env.homeDir, '.volta', 'bin'),
    join(env.homeDir, '.yarn', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin'
  ]
  // Newest node version first, so a package installed under the current runtime wins over one left
  // behind by an older version the user has since moved off.
  const nvmRoot = join(env.homeDir, '.nvm', 'versions', 'node')
  const versions = env
    .listDirectory(nvmRoot)
    .filter((entry) => /^v?\d/.test(entry))
    .sort((left, right) => right.localeCompare(left, 'en', { numeric: true }))
    .slice(0, 8)
  return [...directories, ...versions.map((version) => join(nvmRoot, version, 'bin'))]
}

/** Windows console scripts land as .exe or .cmd; everything else uses the bare name. */
function candidateNames(binary: string, platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? [`${binary}.exe`, `${binary}.cmd`, binary] : [binary]
}

function findOnPath(binary: string, env: BinaryProbeEnv): string | null {
  const names = candidateNames(binary, env.platform)
  for (const directory of env.pathEntries) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (env.isExecutableFile(candidate)) {
        return candidate
      }
    }
  }
  for (const directory of fallbackBinDirectories(env)) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (env.isExecutableFile(candidate)) {
        return candidate
      }
    }
  }
  return null
}

function readPipxVersion(binary: string, env: BinaryProbeEnv): string | null {
  const raw = env.readText(
    join(env.homeDir, '.local', 'pipx', 'venvs', binary, 'pipx_metadata.json')
  )
  if (raw === null) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as { main_package?: { package_version?: unknown } }
    const version = parsed.main_package?.package_version
    return typeof version === 'string' && version.length > 0 ? version : null
  } catch {
    return null
  }
}

/**
 * Walks up from the resolved executable to the nearest package.json and reads its version.
 *
 * This is what makes an npm global install readable without knowing the npm prefix: the shim in
 * `<prefix>/bin` resolves into `<prefix>/lib/node_modules/<pkg>/…`, and the package's own manifest
 * is the authority on what version landed. Bounded to a few levels so a binary that resolves into
 * an unrelated tree cannot walk to the filesystem root.
 */
function readPackageJsonVersion(realPath: string, env: BinaryProbeEnv): string | null {
  const root = parse(realPath).root
  let directory = dirname(realPath)
  for (let depth = 0; depth < 6 && directory !== root; depth += 1) {
    const raw = env.readText(join(directory, 'package.json'))
    if (raw !== null) {
      try {
        const version = (JSON.parse(raw) as { version?: unknown }).version
        if (typeof version === 'string' && version.length > 0) {
          return version
        }
      } catch {
        // A malformed manifest beside the binary tells us nothing; keep walking.
      }
    }
    directory = dirname(directory)
  }
  return null
}

export function probeBinary(
  binary: string,
  env: BinaryProbeEnv = createDefaultBinaryProbeEnv()
): BinaryProbeResult {
  const path = findOnPath(binary, env)
  if (path === null) {
    return { found: false, path: null, realPath: null, version: null, versionSource: null }
  }
  const realPath = env.realPath(path) ?? path

  const pipxVersion = readPipxVersion(binary, env)
  if (pipxVersion !== null) {
    return { found: true, path, realPath, version: pipxVersion, versionSource: 'pipx' }
  }

  const packageVersion = readPackageJsonVersion(realPath, env)
  if (packageVersion !== null) {
    return { found: true, path, realPath, version: packageVersion, versionSource: 'package-json' }
  }

  // Found but unversioned is a real answer, not a failure: the entry is installed, and "is it
  // current?" simply has no honest answer yet.
  return { found: true, path, realPath, version: null, versionSource: null }
}
