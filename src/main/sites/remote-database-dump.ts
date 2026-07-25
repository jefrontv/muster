// Dumping the remote WordPress database and bringing it down.
//
// Ported from ocsites deploy/backup.py:567-631. Remote paths are POSIX and built with `/` on
// purpose — path.join would emit backslashes when Muster itself runs on Windows.

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { renderMysqlOptionFile } from './mysql-binary'
import {
  quoteShellArgument,
  SiteRunStepError,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteSshSession
} from './pipeline-contract'
import type { MysqlCredentials } from './wp-config-reader'

/** Shared with the import pipeline's cleanup so the two cannot drift apart. */
export const LOCAL_DUMP_FILENAME = 'db_backup.sql.gz'

const REMOTE_OPTION_FILENAME = '.muster-dump.cnf'
const DUMP_STEP = 'database-dump'

export type RemoteDatabaseDump = {
  localDumpPath: string
  remoteDbName: string
}

/**
 * `mysqldump | gzip` behind `set -o pipefail`.
 *
 * pipefail is load-bearing: it makes the pipeline's exit status reflect mysqldump instead of
 * gzip's success. Without it a dump that dies mid-stream still leaves a valid, truncated .gz
 * that imports as a silently corrupt database with no error anywhere.
 */
export function buildRemoteDumpCommand(
  optionFilePath: string,
  dbName: string,
  remoteDumpPath: string
): string {
  const pipeline =
    'set -o pipefail; ' +
    `mysqldump --defaults-extra-file=${quoteShellArgument(optionFilePath)} ` +
    `${quoteShellArgument(dbName)} | gzip > ${quoteShellArgument(remoteDumpPath)}`
  // bash, not sh: pipefail is not POSIX and Debian's dash aborts the whole command on it.
  return `bash -c ${quoteShellArgument(pipeline)}`
}

async function assertDumpIsNotEmpty(localDumpPath: string): Promise<void> {
  let size: number
  try {
    size = (await stat(localDumpPath)).size
  } catch (error) {
    throw new SiteRunStepError(
      DUMP_STEP,
      `Database dump missing after download: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  // The last line of defence before an import wipes the local database with nothing.
  if (size === 0) {
    throw new SiteRunStepError(DUMP_STEP, 'Downloaded database dump is empty — aborting import.')
  }
}

async function createRemoteDump(
  context: SiteRunContext,
  session: SiteSshSession,
  credentials: MysqlCredentials,
  paths: { optionFilePath: string; remoteDumpPath: string }
): Promise<void> {
  context.status('Creating database dump')
  await session.writeSecureRemoteFile(
    paths.optionFilePath,
    renderMysqlOptionFile({ user: credentials.user, password: credentials.password })
  )
  context.throwIfCancelled()
  const result = await session.exec(
    buildRemoteDumpCommand(paths.optionFilePath, credentials.name, paths.remoteDumpPath),
    // No deadline: a large site legitimately dumps for tens of minutes, and a wall-clock kill
    // here is exactly how you get a truncated dump.
    { timeoutMs: 0 }
  )
  if (result.code !== 0) {
    const detail = result.stderr.trim() || `mysqldump exited ${result.code}`
    throw new SiteRunStepError(DUMP_STEP, `Error creating database backup: ${detail}`)
  }
}

/**
 * Dump the remote database, download it, and clean up both remote artefacts.
 *
 * Credentials reach mysqldump through a 0600 option file rather than argv, so they never appear
 * in the remote process table.
 */
export async function dumpAndDownloadRemoteDatabase(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  credentials: MysqlCredentials
): Promise<RemoteDatabaseDump> {
  if (!credentials.name || !credentials.user || !credentials.password) {
    throw new SiteRunStepError(
      DUMP_STEP,
      'Could not retrieve database credentials from wp-config.php.'
    )
  }
  const rootPath = config.environment.rootPath
  const optionFilePath = `${rootPath}/${REMOTE_OPTION_FILENAME}`
  const remoteDumpPath = `${rootPath}/${LOCAL_DUMP_FILENAME}`
  const localDumpPath = join(config.wpDir, LOCAL_DUMP_FILENAME)

  try {
    await createRemoteDump(context, session, credentials, { optionFilePath, remoteDumpPath })
    context.throwIfCancelled()
    context.status('Downloading database backup')
    await session.download(remoteDumpPath, localDumpPath, (transferred, total) => {
      context.progress({ label: 'Downloading database', transferred, total })
    })
  } finally {
    // Neither the credentials nor a multi-GB dump may survive a failure or a cancel.
    await session.removeRemoteFile(optionFilePath)
    await session.removeRemoteFile(remoteDumpPath)
  }

  await assertDumpIsNotEmpty(localDumpPath)
  context.log(`Downloaded database dump for '${credentials.name}'.`)
  return { localDumpPath, remoteDbName: credentials.name }
}
