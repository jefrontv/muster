// Connectivity and simple reads against the LOCAL WordPress database.
//
// Two transports, because the local stacks disagree: LocalWP runs a per-site mysqld on a Unix
// socket, while MAMP and DBngin listen on 127.0.0.1. Ported from ocsites deploy/backup.py:396-418
// (the preflight) and deploy/database.py:199-222 (the active-theme read).
//
// The preflight exists to fail fast: without it an unreachable local server is only discovered
// after a multi-GB dump has been made and downloaded.

import { Buffer } from 'node:buffer'
import { createConnection } from 'mysql2/promise'
import { LOCAL_MYSQL_HOST, redactPassword } from './mysql-binary'
import { SiteRunStepError, type SiteRunConfig } from './pipeline-contract'
import { normalizeTablePrefix, parseWpTablePrefix, readWpConfigFile } from './wp-config-reader'

const LOCAL_MYSQL_STEP = 'local-mysql'
const CONNECT_TIMEOUT_MS = 5_000

export type LocalMysqlTarget = {
  user: string
  password: string
  /** Empty or absent selects 127.0.0.1 TCP. */
  socketPath?: string
  port?: number | null
  database?: string
}

/** Deliberately a subset of mysql2's ConnectionOptions, so it stays assertable in a test. */
export type LocalMysqlConnectionOptions = {
  user: string
  password: string
  connectTimeout: number
  socketPath?: string
  host?: string
  port?: number
  database?: string
}

export type LocalMysqlConnection = {
  query: (sql: string) => Promise<unknown>
  end: () => Promise<void>
}

/** The seam that keeps this module testable without a MySQL server. */
export type LocalMysqlConnector = (
  options: LocalMysqlConnectionOptions
) => Promise<LocalMysqlConnection>

const connectWithMysql2: LocalMysqlConnector = async (options) => {
  const connection = await createConnection(options)
  return {
    query: async (sql) => {
      const [rows] = await connection.query(sql)
      return rows
    },
    end: () => connection.end()
  }
}

export function buildLocalMysqlConnectionOptions(
  target: LocalMysqlTarget
): LocalMysqlConnectionOptions {
  const options: LocalMysqlConnectionOptions = {
    user: target.user,
    password: target.password,
    connectTimeout: CONNECT_TIMEOUT_MS
  }
  if (target.database) {
    options.database = target.database
  }
  const socketPath = target.socketPath?.trim() ?? ''
  if (socketPath.length > 0) {
    options.socketPath = socketPath
    return options
  }
  options.host = LOCAL_MYSQL_HOST
  if (target.port) {
    options.port = target.port
  }
  return options
}

export function localMysqlTargetForSite(config: SiteRunConfig): LocalMysqlTarget {
  return {
    user: config.site.dbUser,
    password: config.dbPassword,
    socketPath: config.site.dbSocket,
    port: config.site.dbPort
  }
}

function describeTarget(target: LocalMysqlTarget): string {
  const socketPath = target.socketPath?.trim() ?? ''
  const location = socketPath.length > 0 ? `socket ${socketPath}` : LOCAL_MYSQL_HOST
  return `${location}, user: ${target.user}`
}

async function withConnection<T>(
  target: LocalMysqlTarget,
  connect: LocalMysqlConnector,
  run: (connection: LocalMysqlConnection) => Promise<T>
): Promise<T> {
  const connection = await connect(buildLocalMysqlConnectionOptions(target))
  try {
    return await run(connection)
  } finally {
    // Best effort: a failing close must not mask the real error from `run`.
    await connection.end().catch(() => undefined)
  }
}

/** Fail fast, before any SSH work starts, if the local server is not accepting connections. */
export async function checkLocalMysqlConnection(
  config: SiteRunConfig,
  connect: LocalMysqlConnector = connectWithMysql2
): Promise<void> {
  const target = localMysqlTargetForSite(config)
  try {
    await withConnection(target, connect, async () => undefined)
  } catch (error) {
    const detail = redactPassword(
      error instanceof Error ? error.message : String(error),
      target.password
    )
    throw new SiteRunStepError(
      LOCAL_MYSQL_STEP,
      `Cannot connect to local MySQL (${describeTarget(target)}): ${detail} — make sure your ` +
        'local MySQL server is running before importing.'
    )
  }
}

/** Table prefix from the local wp-config.php, falling back to `wp_` like WordPress itself. */
export async function readLocalTablePrefix(localWpRoot: string): Promise<string> {
  const contents = await readWpConfigFile(localWpRoot)
  return normalizeTablePrefix(contents === null ? null : parseWpTablePrefix(contents))
}

function firstOptionValue(rows: unknown): string | null {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null
  }
  const row: unknown = rows[0]
  if (typeof row !== 'object' || row === null) {
    return null
  }
  const value = (row as Record<string, unknown>).option_value
  // A longtext column comes back as a string, but a binary-collation column arrives as a Buffer.
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8')
  }
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Active theme slug from the local database — the theme whose dist directory gets deployed. */
export async function getActiveThemeFromLocalDb(
  config: SiteRunConfig,
  dbName: string,
  connect: LocalMysqlConnector = connectWithMysql2
): Promise<string> {
  const prefix = await readLocalTablePrefix(config.wpDir)
  const target: LocalMysqlTarget = { ...localMysqlTargetForSite(config), database: dbName }
  let rows: unknown
  try {
    rows = await withConnection(target, connect, (connection) =>
      connection.query(`SELECT option_value FROM ${prefix}options WHERE option_name = 'template';`)
    )
  } catch (error) {
    const detail = redactPassword(
      error instanceof Error ? error.message : String(error),
      target.password
    )
    throw new SiteRunStepError(
      LOCAL_MYSQL_STEP,
      `Cannot read the active theme from local database '${dbName}' (${describeTarget(target)}): ${detail}`
    )
  }
  const theme = firstOptionValue(rows)
  if (theme === null) {
    throw new SiteRunStepError(
      LOCAL_MYSQL_STEP,
      `Could not determine the active theme from local database '${dbName}' — no '${prefix}options' row for 'template'.`
    )
  }
  return theme
}
