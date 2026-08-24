// The local MySQL client: where it lives, and how to hand it credentials safely.
//
// Ported from ocsites deploy/database.py:17-50. macOS installs MySQL outside PATH more often
// than not — Homebrew keeps it keg-only and MAMP ships its own copy — so `which mysql` alone
// strands users who have a perfectly working server.

import { accessSync, constants, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { SiteRunStepError } from './pipeline-contract'

const MYSQL_BINARY_STEP = 'mysql-binary'

/** The only address the local client ever dials over TCP; LocalWP uses a socket instead. */
export const LOCAL_MYSQL_HOST = '127.0.0.1'

export type MysqlBinaryName = 'mysql' | 'mysqldump'

export type MysqlBinaryStatus = {
  binary: MysqlBinaryName
  /** Absolute path, or null when the binary could not be found. */
  path: string | null
}

/** Renderable by the UI as-is: a red/green row per binary plus the fix to show when missing. */
export type MysqlBinaryHealth = {
  ok: boolean
  binaries: MysqlBinaryStatus[]
  /** Null when everything resolved. */
  remedy: string | null
}

/** Searched after PATH. These are macOS install locations; harmlessly absent elsewhere. */
export const FALLBACK_MYSQL_DIRECTORIES = [
  '/opt/homebrew/opt/mysql/bin',
  '/opt/homebrew/bin',
  '/usr/local/opt/mysql/bin',
  '/usr/local/bin',
  '/Applications/MAMP/Library/bin'
]

// Names mysql-client because that is the formula a WordPress user usually has: it is keg-only, so
// it satisfies this check without ever landing on PATH.
const INSTALL_REMEDY =
  'Install the MySQL client (`brew install mysql-client`) or add its bin directory to PATH.'

/**
 * Homebrew roots where a keg-only formula parks its own bin dir, newest macOS layout first.
 *
 * Every mysql formula is keg-only, so `mysql-client@8.0` is never symlinked into
 * /opt/homebrew/bin — a user can have a working client that `which mysql` cannot see. Reading the
 * opt root beats naming versions: `mysql`, `mysql@8.4`, `mysql-client` and `mysql-client@8.0` all
 * resolve without this list going stale on the next release.
 */
const HOMEBREW_OPT_ROOTS = ['/opt/homebrew/opt', '/usr/local/opt']

/** Brew's unversioned names are symlinks to the current keg, so they lead. */
function rankHomebrewKeg(name: string): number {
  if (name === 'mysql') {
    return 0
  }
  return name === 'mysql-client' ? 1 : 2
}

/** Injected in tests so ordering is asserted without depending on the host's own installs. */
export type MysqlDirectoryLister = (directory: string) => string[]

function readDirectoryNames(directory: string): string[] {
  try {
    return readdirSync(directory)
  } catch {
    // Absent on Linux/Windows and on a Mac without Homebrew; not a fault worth reporting.
    return []
  }
}

export function homebrewMysqlDirectories(
  list: MysqlDirectoryLister = readDirectoryNames
): string[] {
  const found: string[] = []
  for (const root of HOMEBREW_OPT_ROOTS) {
    const kegs = list(root)
      .filter((name) => name === 'mysql' || name.startsWith('mysql@') || name.startsWith('mysql-'))
      .sort(
        (a, b) =>
          rankHomebrewKeg(a) - rankHomebrewKeg(b) ||
          // Numeric so mysql@8.10 sorts above mysql@8.4 rather than beside mysql@8.1.
          b.localeCompare(a, undefined, { numeric: true })
      )
    for (const keg of kegs) {
      found.push(join(root, keg, 'bin'))
    }
  }
  return found
}

/**
 * LocalWP bundles its own client under
 * `~/Library/Application Support/Local/lightning-services/mysql-<version>/bin/<platform>/bin`.
 *
 * A LocalWP user can therefore be running MySQL happily with no system install at all, which is
 * exactly the import that reported the binary missing. The platform segment is read rather than
 * derived: LocalWP has shipped both `darwin` and `darwin-arm64` and only it decides which.
 */
export function localWpMysqlDirectories(
  home = homedir(),
  list: MysqlDirectoryLister = readDirectoryNames
): string[] {
  if (home.length === 0) {
    return []
  }
  const services = join(home, 'Library', 'Application Support', 'Local', 'lightning-services')
  const versions = list(services)
    .filter((name) => name.startsWith('mysql-'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  const found: string[] = []
  for (const version of versions) {
    const platformRoot = join(services, version, 'bin')
    for (const platform of list(platformRoot)) {
      found.push(join(platformRoot, platform, 'bin'))
    }
  }
  return found
}

/** Every install location PATH cannot be trusted to expose, in the order they should be tried. */
export function discoverMysqlDirectories(): string[] {
  return [...homebrewMysqlDirectories(), ...localWpMysqlDirectories()]
}

/**
 * PATH first, then the known install locations — a user's own PATH must always win.
 *
 * The discovered directories come last: they are a safety net for installs PATH cannot see, and
 * must never outrank the client the user deliberately put on their PATH.
 */
export function mysqlSearchDirectories(
  pathValue = process.env.PATH ?? '',
  discover: () => string[] = discoverMysqlDirectories
): string[] {
  const fromPath = pathValue.split(delimiter).filter((entry) => entry.length > 0)
  return [...fromPath, ...FALLBACK_MYSQL_DIRECTORIES, ...discover()]
}

function isExecutableFile(candidate: string): boolean {
  try {
    // X_OK alone passes on directories, and `/usr/local/bin/mysql` being a directory is exactly
    // the kind of half-finished install this has to survive.
    if (!statSync(candidate).isFile()) {
      return false
    }
    accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function findMysqlBinary(
  name: MysqlBinaryName,
  directories = mysqlSearchDirectories()
): string | null {
  for (const directory of directories) {
    const candidate = join(directory, name)
    if (isExecutableFile(candidate)) {
      return candidate
    }
  }
  return null
}

function resolveBinary(name: MysqlBinaryName, directories?: string[]): string {
  const found = findMysqlBinary(name, directories)
  if (found === null) {
    throw new SiteRunStepError(
      MYSQL_BINARY_STEP,
      `Could not find the ${name} binary. ${INSTALL_REMEDY}`
    )
  }
  return found
}

export function resolveMysqlBinary(directories?: string[]): string {
  return resolveBinary('mysql', directories)
}

export function resolveMysqldumpBinary(directories?: string[]): string {
  return resolveBinary('mysqldump', directories)
}

export function checkMysqlBinaryHealth(directories = mysqlSearchDirectories()): MysqlBinaryHealth {
  const names: MysqlBinaryName[] = ['mysql', 'mysqldump']
  const binaries = names.map((binary) => ({ binary, path: findMysqlBinary(binary, directories) }))
  const ok = binaries.every((status) => status.path !== null)
  return { ok, binaries, remedy: ok ? null : INSTALL_REMEDY }
}

/** Omit for the remote dump: it must inherit DB_HOST from the server's own wp-config.php. */
export type MysqlOptionFileTransport =
  | { kind: 'socket'; socketPath: string }
  | { kind: 'tcp'; port: number | null }

export type MysqlOptionFileFields = {
  user: string
  password: string
  transport?: MysqlOptionFileTransport
}

/** MySQL option files take double-quoted values with backslash escapes. */
function quoteOptionValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function transportLines(transport: MysqlOptionFileTransport): string[] {
  if (transport.kind === 'socket') {
    return [`socket=${quoteOptionValue(transport.socketPath)}`]
  }
  const lines = [`host=${quoteOptionValue(LOCAL_MYSQL_HOST)}`, 'protocol=tcp']
  if (transport.port) {
    lines.push(`port=${transport.port}`)
  }
  return lines
}

/**
 * Render a `[client]` option-file body. Credentials go here rather than into argv so they never
 * surface in the process table (`ps`, /proc) — on a shared host that table belongs to everyone.
 */
export function renderMysqlOptionFile(fields: MysqlOptionFileFields): string {
  const lines = [
    '[client]',
    `user=${quoteOptionValue(fields.user)}`,
    `password=${quoteOptionValue(fields.password)}`,
    ...(fields.transport ? transportLines(fields.transport) : [])
  ]
  return `${lines.join('\n')}\n`
}

/** Last line of defence: nothing derived from a child process or driver error reaches a log raw. */
export function redactPassword(text: string, password: string): string {
  return password.length === 0 ? text : text.replaceAll(password, '********')
}
