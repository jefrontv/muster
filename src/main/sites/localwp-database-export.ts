// Gzipped dump of a site's CURRENT local database, taken before it is re-imported into LocalWP's
// own MySQL. Ported from ocsites deploy/local_db_backup.backup_local_db.
//
// Credentials go through a 0600 option file, never argv — argv is world-readable via `ps`. Nothing
// here logs the password: mysqldump stderr is redacted before it reaches the returned message.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { streamCommand } from '../lib/stream-command'
import {
  findMysqlBinary,
  redactPassword,
  renderMysqlOptionFile,
  type MysqlOptionFileTransport
} from './mysql-binary'
import { quoteShellArgument } from './pipeline-contract'

const MYSQLDUMP_STDERR_LIMIT = 200
const EXPORT_DIRECTORY_PREFIX = 'muster-localwp-export-'

export type LocalDatabaseExportRequest = {
  databaseName: string
  databaseUser: string
  databasePassword: string
  /** Unix socket for a per-site daemon; empty falls back to 127.0.0.1 TCP. */
  databaseSocket?: string
  onStatus?: (message: string) => void
  signal?: AbortSignal
}

export type LocalDatabaseExportResult =
  | { ok: true; dumpPath: string; workDirectory: string }
  | { ok: false; reason: string; databaseMissing: boolean }

export async function exportLocalDatabase(
  request: LocalDatabaseExportRequest
): Promise<LocalDatabaseExportResult> {
  // A missing binary must not fail the migration — the files still move and the user imports the
  // database by hand, so probe rather than using the throwing resolveMysqldumpBinary.
  const binary = findMysqlBinary('mysqldump')
  if (binary === null) {
    return {
      ok: false,
      databaseMissing: false,
      reason: 'mysqldump was not found — the local database cannot be exported.'
    }
  }
  const transport: MysqlOptionFileTransport = request.databaseSocket
    ? { kind: 'socket', socketPath: request.databaseSocket }
    : { kind: 'tcp', port: null }
  const workDirectory = await mkdtemp(path.join(tmpdir(), EXPORT_DIRECTORY_PREFIX))
  const optionFile = path.join(workDirectory, 'client.cnf')
  const dumpPath = path.join(workDirectory, 'local-db-export.sql.gz')
  try {
    await writeFile(
      optionFile,
      renderMysqlOptionFile({
        user: request.databaseUser,
        password: request.databasePassword,
        transport
      }),
      { mode: 0o600 }
    )
    request.onStatus?.(`Exporting local database '${request.databaseName}'…`)
    // A shell is required for the pipe; pipefail makes a failed mysqldump fail the whole command
    // instead of leaving a truncated but "successful" gzip.
    const command = [
      'set -o pipefail;',
      quoteShellArgument(binary),
      `--defaults-extra-file=${quoteShellArgument(optionFile)}`,
      '--single-transaction --quick --no-tablespaces --routines --triggers',
      quoteShellArgument(request.databaseName),
      `| gzip > ${quoteShellArgument(dumpPath)}`
    ].join(' ')
    // timeoutMs: 0 — a wall-clock deadline on a large dump is how you get a truncated database.
    // bash, not sh: `set -o pipefail` is not POSIX and Debian's dash aborts on it.
    const result = await streamCommand('/bin/bash', ['-c', command], {
      timeoutMs: 0,
      signal: request.signal
    })
    if (result.code !== 0) {
      return await failExport(
        workDirectory,
        redactPassword(result.stderr, request.databasePassword).trim(),
        request.databaseName
      )
    }
  } catch (error) {
    await rm(workDirectory, { recursive: true, force: true })
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    return {
      ok: false,
      databaseMissing: false,
      reason: `Local database export failed: ${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    // The credential file must not outlive the dump, even on the success path.
    await rm(optionFile, { force: true })
  }
  return { ok: true, dumpPath, workDirectory }
}

async function failExport(
  workDirectory: string,
  detail: string,
  databaseName: string
): Promise<LocalDatabaseExportResult> {
  await rm(workDirectory, { recursive: true, force: true })
  const databaseMissing =
    detail.includes('Unknown database') || detail.toLowerCase().includes("doesn't exist")
  return {
    ok: false,
    databaseMissing,
    reason: databaseMissing
      ? `Local database '${databaseName}' does not exist.`
      : `mysqldump failed: ${detail.slice(0, MYSQLDUMP_STDERR_LIMIT)}`
  }
}

/**
 * Removes the temp directory exportLocalDatabase created. Refuses anything that is not one of our
 * own mkdtemp directories — this deletes a whole tree, so it must never be handed a caller's path.
 */
export async function discardLocalDatabaseExport(workDirectory: string): Promise<void> {
  if (!path.basename(workDirectory).startsWith(EXPORT_DIRECTORY_PREFIX)) {
    throw new Error(
      `Refusing to delete a directory that is not a database export: ${workDirectory}`
    )
  }
  await rm(workDirectory, { recursive: true, force: true })
}
