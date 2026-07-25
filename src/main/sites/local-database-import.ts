// Importing a gzipped dump into the local MySQL server.
//
// Ported from ocsites deploy/database.py:144-197, with one deliberate change: ocsites gunzipped
// the whole dump to a temp file before feeding it to the client, which writes a multi-GB site to
// disk twice. Here it is streamed through a pipe instead, guarded by `set -o pipefail` so a
// truncated archive fails the step rather than importing a partial database.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { streamCommand } from '../lib/stream-command'
import { redactPassword, renderMysqlOptionFile, resolveMysqlBinary } from './mysql-binary'
import {
  quoteShellArgument,
  SiteRunStepError,
  type SiteRunConfig,
  type SiteRunContext
} from './pipeline-contract'

const IMPORT_STEP = 'database-import'

export type ImportCommandPaths = {
  mysqlBinary: string
  optionFilePath: string
  dbName: string
}

/** The local client pins its transport: LocalWP's per-site socket, or 127.0.0.1 for MAMP/DBngin. */
export function renderLocalMysqlOptionFile(config: SiteRunConfig): string {
  const socketPath = config.site.dbSocket.trim()
  return renderMysqlOptionFile({
    user: config.site.dbUser,
    password: config.dbPassword,
    transport:
      socketPath.length > 0
        ? { kind: 'socket', socketPath }
        : { kind: 'tcp', port: config.site.dbPort }
  })
}

/** `gunzip | mysql` behind pipefail, so a corrupt archive cannot import as a partial database. */
export function buildLocalImportPipeline(paths: ImportCommandPaths, dumpPath: string): string {
  return (
    'set -o pipefail; ' +
    `gunzip -c ${quoteShellArgument(dumpPath)} | ${quoteShellArgument(paths.mysqlBinary)} ` +
    `--defaults-extra-file=${quoteShellArgument(paths.optionFilePath)} ` +
    `--database=${quoteShellArgument(paths.dbName)}`
  )
}

async function createDatabase(context: SiteRunContext, paths: ImportCommandPaths): Promise<void> {
  // Backtick-quote the identifier: WordPress database names routinely contain hyphens.
  const identifier = paths.dbName.replaceAll('`', '``')
  const result = await streamCommand(
    paths.mysqlBinary,
    [
      `--defaults-extra-file=${paths.optionFilePath}`,
      '-e',
      `CREATE DATABASE IF NOT EXISTS \`${identifier}\`;`
    ],
    { signal: context.signal, timeoutMs: 0 }
  )
  if (result.code !== 0) {
    const detail = result.stderr.trim() || `mysql exited ${result.code}`
    throw new SiteRunStepError(IMPORT_STEP, `Error creating database '${paths.dbName}': ${detail}`)
  }
}

/**
 * Import a gzipped SQL dump into the local database, creating it when missing.
 *
 * Cleanup of `dumpPath` belongs to the caller: the import pipeline removes it only once every
 * later stage has had its chance to fail, so a re-run does not need a second download.
 */
export async function importLocalDatabase(
  context: SiteRunContext,
  config: SiteRunConfig,
  dumpPath: string,
  dbName: string
): Promise<void> {
  const mysqlBinary = resolveMysqlBinary()
  const workDir = await mkdtemp(join(tmpdir(), 'muster-db-import-'))
  try {
    const optionFilePath = join(workDir, 'mysql-client.cnf')
    await writeFile(optionFilePath, renderLocalMysqlOptionFile(config), { mode: 0o600 })
    const paths: ImportCommandPaths = { mysqlBinary, optionFilePath, dbName }

    context.throwIfCancelled()
    await createDatabase(context, paths)

    context.throwIfCancelled()
    context.status('Importing database')
    // bash, not sh: pipefail is not POSIX and Debian's dash aborts the whole command on it.
    const result = await streamCommand(
      '/bin/bash',
      ['-c', buildLocalImportPipeline(paths, dumpPath)],
      {
        signal: context.signal,
        // No deadline: a large import legitimately runs for tens of minutes, and killing it
        // half-way leaves the local site with a partially replaced schema.
        timeoutMs: 0,
        onStderr: (chunk) => {
          const line = redactPassword(chunk, config.dbPassword).trimEnd()
          if (line.length > 0) {
            context.log(line)
          }
        }
      }
    )
    if (result.code !== 0) {
      const detail = redactPassword(
        result.stderr.trim() || `mysql exited ${result.code}`,
        config.dbPassword
      )
      throw new SiteRunStepError(IMPORT_STEP, `Error importing database '${dbName}': ${detail}`)
    }
    context.log(`Imported database '${dbName}'.`)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
