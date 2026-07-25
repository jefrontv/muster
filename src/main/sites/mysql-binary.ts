// The local MySQL client: where it lives, and how to hand it credentials safely.
//
// Ported from ocsites deploy/database.py:17-50. macOS installs MySQL outside PATH more often
// than not — Homebrew keeps it keg-only and MAMP ships its own copy — so `which mysql` alone
// strands users who have a perfectly working server.

import { accessSync, constants, statSync } from 'node:fs'
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

const INSTALL_REMEDY = 'Install MySQL (`brew install mysql`) or add its bin directory to PATH.'

/** PATH first, then the known install locations — a user's own PATH must always win. */
export function mysqlSearchDirectories(pathValue = process.env.PATH ?? ''): string[] {
  const fromPath = pathValue.split(delimiter).filter((entry) => entry.length > 0)
  return [...fromPath, ...FALLBACK_MYSQL_DIRECTORIES]
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
