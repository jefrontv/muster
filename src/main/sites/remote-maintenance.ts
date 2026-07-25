// Server-side maintenance steps of an ocsites deploy (deploy/server.py:25-61).
//
// Unlike the Python, these reuse the run's existing SSH session instead of dialling a fresh
// connection each — three connections per deploy was three password handshakes and three
// keepalive threads for two one-line commands.

import path from 'node:path'

import { SiteRunStepError, quoteShellArgument } from './pipeline-contract'
import type { SiteRunConfig, SiteRunContext, SiteSshSession } from './pipeline-contract'

const CLEAR_CACHE_STEP = 'clear-server-cache'
const GIT_PULL_STEP = 'git-pull-on-server'

export async function clearRemoteServerCache(
  context: SiteRunContext,
  config: SiteRunConfig,
  session: SiteSshSession
): Promise<void> {
  context.status('Clearing server cache')
  const cacheDir = quoteShellArgument(
    path.posix.join(config.environment.rootPath, 'wp-content', 'cache')
  )
  // `rm -rf */` stays unquoted so the remote shell expands it: it empties the cache directory
  // without deleting the directory itself, which WordPress expects to still be there.
  const result = await session.exec(`cd ${cacheDir} && rm -rf */`)
  const stderr = result.stderr.trim()
  if (stderr) {
    throw new SiteRunStepError(CLEAR_CACHE_STEP, `Error clearing server cache: ${stderr}`)
  }
  if (result.code !== 0) {
    throw new SiteRunStepError(CLEAR_CACHE_STEP, 'Error clearing server cache')
  }
  const stdout = result.stdout.trim()
  if (stdout) {
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
