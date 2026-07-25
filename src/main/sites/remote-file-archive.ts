// Pulling the server's files down as two zips, ported from ocsites
// deploy/backup.py::_handle_file_operations and ::_find_prune_zip_command.
//
// Two archives rather than one: base.zip is the webroot minus the content tree, and the content
// zip is wp-content/ (Bedrock: app/) minus themes and the big media/cache dirs. Themes come from
// git, uploads are proxied to the live domain by the .htaccess rewrite, so neither is worth
// transferring.

import path from 'node:path'
import {
  quoteShellArgument,
  type RemoteLayout,
  type SiteRunConfig,
  type SiteRunContext,
  SiteRunStepError,
  type SiteSshSession
} from './pipeline-contract'

export const BASE_ARCHIVE_NAME = 'base.zip'

/** Temp artifacts an interrupted run orphans in wpDir; 'app.zip' is Bedrock's content zip. */
export const SITE_TEMP_ARCHIVE_NAMES = ['base.zip', 'wp-content.zip', 'app.zip'] as const

// Matches ocsites' 600s per-command budget. Zipping a webroot is bounded work once the big dirs
// are pruned, so a deadline here is a genuine "the server is wedged" signal.
const REMOTE_ZIP_TIMEOUT_MS = 600_000

const BASE_PRUNE_DIRS = ['.git', '.well-known', '_opcache']
const BASE_EXCLUDE_GLOBS = ['*.zip', '.gitattributes', '.gitignore']

// uploads is the load-bearing entry: it can be tens of GB. themes come from git.
const CONTENT_PRUNE_DIRS = ['themes', 'cache', 'uploads', 'webp-express', 'upgrade-temp-backup']
const CONTENT_EXCLUDE_GLOBS = ['*.zip', '*.tar.gz', 'debug.log']

/**
 * A `find -prune | zip -@` pipeline that never DESCENDS into the excluded top-level directories.
 *
 * `zip -r . -x 'uploads/*'` still walks the whole uploads tree to test each file against the
 * pattern before discarding it — catastrophic when uploads is tens of GB, because it can outlast
 * the command timeout while adding nothing. `find … -prune` never enters those directories, so a
 * huge uploads/ costs essentially nothing. `zip -@` reads the surviving file list from stdin.
 *
 * `pruneDirs` must be non-empty: `find . \( \) -prune` is a syntax error.
 */
export function buildPruneZipCommand(
  workDir: string,
  zipName: string,
  pruneDirs: string[],
  excludeGlobs: string[]
): string {
  const prune = pruneDirs.map((dir) => `-path ${quoteShellArgument(`./${dir}`)}`).join(' -o ')
  const names = excludeGlobs.map((glob) => `! -name ${quoteShellArgument(glob)}`).join(' ')
  const select = `find . \\( ${prune} \\) -prune -o -type f ${names} -print`
  return `cd ${quoteShellArgument(workDir)} && ${select} | zip -q ${quoteShellArgument(zipName)} -@`
}

export type PulledSiteArchives = {
  /** Extracts over wpDir. */
  baseArchivePath: string
  /** Extracts into wpDir/<contentDirectoryName>. */
  contentArchivePath: string
  contentDirectoryName: string
}

type ArchivePull = {
  step: string
  label: string
  /** Also where the zip is written, so the remote path is workDir/archiveName. */
  workDir: string
  archiveName: string
  localArchivePath: string
  pruneDirs: string[]
  excludeGlobs: string[]
}

export async function pullRemoteFileArchives(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout
): Promise<PulledSiteArchives> {
  const contentArchiveName = `${layout.contentDir}.zip`
  const baseArchivePath = path.join(config.wpDir, BASE_ARCHIVE_NAME)
  const contentArchivePath = path.join(config.wpDir, contentArchiveName)

  await createAndDownloadArchive(context, session, {
    step: 'pull-base-archive',
    label: BASE_ARCHIVE_NAME,
    workDir: layout.webroot,
    archiveName: BASE_ARCHIVE_NAME,
    localArchivePath: baseArchivePath,
    // The content tree is pulled separately; pruning it here also keeps base.zip off uploads.
    pruneDirs: [...BASE_PRUNE_DIRS, layout.contentDir],
    excludeGlobs: BASE_EXCLUDE_GLOBS
  })

  context.throwIfCancelled()

  await createAndDownloadArchive(context, session, {
    step: 'pull-content-archive',
    label: contentArchiveName,
    workDir: `${layout.webroot}/${layout.contentDir}`,
    archiveName: contentArchiveName,
    localArchivePath: contentArchivePath,
    pruneDirs: CONTENT_PRUNE_DIRS,
    excludeGlobs: CONTENT_EXCLUDE_GLOBS
  })

  return { baseArchivePath, contentArchivePath, contentDirectoryName: layout.contentDir }
}

async function createAndDownloadArchive(
  context: SiteRunContext,
  session: SiteSshSession,
  pull: ArchivePull
): Promise<void> {
  const remoteArchivePath = `${pull.workDir}/${pull.archiveName}`
  context.status(`Creating ${pull.label}…`)
  const command = buildPruneZipCommand(
    pull.workDir,
    pull.archiveName,
    pull.pruneDirs,
    pull.excludeGlobs
  )
  const created = await session.exec(command, { timeoutMs: REMOTE_ZIP_TIMEOUT_MS })
  if (created.code !== 0) {
    throw new SiteRunStepError(
      pull.step,
      `Error creating ${pull.label}: ${created.stderr.trim() || `zip exited ${created.code}`}`
    )
  }

  // The remote zip goes away even when the download fails or is cancelled — otherwise a broken
  // run leaves a multi-hundred-MB file sitting in the customer's webroot.
  try {
    context.status(`Downloading ${pull.label}…`)
    await session.download(remoteArchivePath, pull.localArchivePath, (transferred, total) => {
      context.progress({ label: `Downloading ${pull.label}`, transferred, total })
    })
  } finally {
    await session.removeRemoteFile(remoteArchivePath)
  }
}
