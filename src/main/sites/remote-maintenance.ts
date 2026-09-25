// Server-side maintenance steps of an ocsites deploy (deploy/server.py:25-61).
//
// Unlike the Python, these reuse the run's existing SSH session instead of dialling a fresh
// connection each — three connections per deploy was three password handshakes and three
// keepalive threads for two one-line commands.

import path from 'node:path'

import { SiteRunStepError, quoteShellArgument } from './pipeline-contract'
import type {
  RemoteLayout,
  SiteRunConfig,
  SiteRunContext,
  SiteSshSession
} from './pipeline-contract'

const CLEAR_CACHE_STEP = 'clear-server-cache'
const NO_CACHE_DIR_MARKER = '__MUSTER_NO_CACHE_DIR__'
const GIT_PULL_STEP = 'git-pull-on-server'

export async function clearRemoteServerCache(
  context: SiteRunContext,
  _config: SiteRunConfig,
  session: SiteSshSession,
  layout: RemoteLayout
): Promise<void> {
  context.status('Clearing server cache')
  // Bedrock keeps its cache under web/app, not wp-content; the resolved layout knows which.
  const cachePath = path.posix.join(layout.webroot, layout.contentDir, 'cache')
  const cacheDir = quoteShellArgument(cachePath)
  // `rm -rf */` stays unquoted so the remote shell expands it: it empties the cache directory
  // without deleting the directory itself, which WordPress expects to still be there.
  const result = await session.exec(
    `if [ ! -d ${cacheDir} ]; then echo ${NO_CACHE_DIR_MARKER}; exit 0; fi; cd ${cacheDir} && rm -rf */`
  )
  const stderr = result.stderr.trim()
  // The exit code decides: rm exits non-zero on a partial clear, while a chatty login shell can
  // print to stderr on a clean run, and failing then marked an already-live deploy as failed.
  if (result.code !== 0) {
    throw new SiteRunStepError(
      CLEAR_CACHE_STEP,
      stderr ? `Error clearing server cache: ${stderr}` : 'Error clearing server cache'
    )
  }
  if (stderr) {
    context.log(stderr)
  }
  const stdout = result.stdout.trim()
  if (stdout === NO_CACHE_DIR_MARKER) {
    context.log(`No cache directory at ${cachePath}; nothing to clear.`)
  } else if (stdout) {
    context.log(stdout)
  }
}

export async function pullRemoteGitChanges(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession
): Promise<void> {
  const { rootPath } = config.environment
  context.status('Pulling latest changes on the server')
  const root = quoteShellArgument(rootPath)

  const probe = await session.exec(`cd ${root} && [ -d .git ]`)
  if (probe.code !== 0) {
    throw new SiteRunStepError(GIT_PULL_STEP, `Not a Git repository: ${rootPath}`)
  }

  // git writes progress to stderr, so only the exit status decides success here. No deadline
  // either: a killed pull can leave the remote index locked mid-merge.
  const result = await session.exec(`cd ${root} && git pull`, { timeoutMs: 0 })
  if (result.code !== 0) {
    throw new SiteRunStepError(GIT_PULL_STEP, result.stderr.trim() || 'git pull failed')
  }
  const stdout = result.stdout.trim()
  if (stdout) {
    context.log(stdout)
  }
}
