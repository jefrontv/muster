// Remote half of the ocsites theme deploy (deploy/server.py:151-205): zip the built dist, SFTP it
// up with byte progress, then swap it into place and normalise permissions server-side.

import { rm, stat } from 'node:fs/promises'
import path from 'node:path'

import { streamCommand } from '../lib/stream-command'
import { SiteRunStepError, quoteShellArgument } from './pipeline-contract'
import type { SiteRunContext, SiteSshSession } from './pipeline-contract'
import { assertPosixDeployHost, runDeployShellScript } from './theme-build'
import type { ThemeDeployPaths } from './theme-build'

const STEP = 'theme-upload'

const UPLOAD_LABEL = 'Uploading theme dist'

export type ThemeUploadDependencies = {
  runCommand?: typeof streamCommand
}

/**
 * Zips the dist *contents*, not the directory, so `unzip -d <basename>` reproduces the tree.
 * The `.[^.]*` pass picks up dotfiles and fails when none match, hence the plain-glob fallback.
 * Only the archive path is quoted — the globs must reach the shell unquoted to expand.
 */
export async function zipThemeDist(
  context: SiteRunContext,
  paths: ThemeDeployPaths,
  dependencies: ThemeUploadDependencies = {}
): Promise<number> {
  assertPosixDeployHost(STEP)
  await rm(paths.localZipPath, { force: true })

  context.status('Zipping theme dist')
  const archive = quoteShellArgument(paths.localZipPath)
  const result = await runDeployShellScript(
    dependencies.runCommand ?? streamCommand,
    '/bin/sh',
    `zip -r ${archive} * .[^.]* 2>/dev/null || zip -r ${archive} *`,
    { cwd: paths.localDistPath, signal: context.signal }
  )
  if (result.code !== 0) {
    throw new SiteRunStepError(STEP, `Zipping the theme dist failed (exit ${result.code}).`)
  }
  try {
    return (await stat(paths.localZipPath)).size
  } catch {
    throw new SiteRunStepError(STEP, `Zip file was not created at ${paths.localZipPath}`)
  }
}

/** Every value here comes from user config, so all of them are quoted. */
export function buildRemoteExtractCommand(paths: ThemeDeployPaths): string {
  const parent = quoteShellArgument(paths.remoteDistParent)
  const archive = quoteShellArgument(paths.remoteZipName)
  const basename = quoteShellArgument(paths.distBasename)
  return [
    `cd ${parent}`,
    `rm -rf ${basename}`,
    `unzip -o ${archive} -d ${basename}`,
    `rm ${archive}`,
    `find ${basename} -type d -exec chmod 755 {} +`,
    `find ${basename} -type f -exec chmod 644 {} +`
  ].join(' && ')
}

export async function uploadThemeDist(
  context: SiteRunContext,
  session: SiteSshSession,
  paths: ThemeDeployPaths,
  dependencies: ThemeUploadDependencies = {}
): Promise<void> {
  const zipBytes = await zipThemeDist(context, paths, dependencies)
  context.throwIfCancelled()

  // The remote assets dir may not exist yet on a first deploy; the exit status is not checked
  // because a real failure resurfaces immediately as an upload error with a better message.
  await session.exec(`mkdir -p ${quoteShellArgument(paths.remoteDistParent)}`)

  const remoteZipPath = path.posix.join(paths.remoteDistParent, paths.remoteZipName)
  context.status(UPLOAD_LABEL)
  context.log(`Theme deploy: uploading to ${paths.remoteDistParent}/${paths.distBasename}/…`)
  try {
    await session.upload(paths.localZipPath, remoteZipPath, (transferred) => {
      context.progress({ label: UPLOAD_LABEL, transferred, total: zipBytes })
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new SiteRunStepError(STEP, `Could not upload zip to ${remoteZipPath}: ${detail}`)
  } finally {
    await rm(paths.localZipPath, { force: true })
  }

  context.throwIfCancelled()
  context.status('Extracting theme dist on the server')
  // No deadline: the old dist is already gone, so a killed unzip would leave a broken live theme.
  const result = await session.exec(buildRemoteExtractCommand(paths), { timeoutMs: 0 })
  // ocsites treats any stderr here as fatal: a partial extract leaves a broken theme live.
  const stderr = result.stderr.trim()
  if (stderr) {
    throw new SiteRunStepError(STEP, stderr)
  }
  if (result.code !== 0) {
    throw new SiteRunStepError(STEP, 'Remote theme extraction failed.')
  }
}
