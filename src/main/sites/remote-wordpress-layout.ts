// Where WordPress actually lives on the server.
//
// Ported from ocsites `_resolve_remote_layout` (deploy/backup.py:344) plus deploy/bedrock.py.
// A standard install serves from the configured root with content in `wp-content`. Roots Bedrock
// serves from `web/` with core in `web/wp` and content in `web/app`, and the configured root may
// point at either the project root or the `web/` docroot — every later stage (zip, theme upload,
// search-replace) targets the wrong tree if this is guessed.

import { posix as posixPath } from 'node:path'
import {
  quoteShellArgument,
  SiteRunStepError,
  type RemoteLayout,
  type SiteSshSession
} from './pipeline-contract'

export const REMOTE_LAYOUT_STEP = 'remote-layout'

/** Probes are `test` calls against a live shell; a minute is already pathological. */
const PROBE_TIMEOUT_MS = 60_000

const BEDROCK_CONTENT_DIR = 'app'
const STANDARD_CONTENT_DIR = 'wp-content'

/**
 * Resolves the served webroot and content directory under `rootPath`, then proves a WordPress
 * install is there. Throws SiteRunStepError when the shell probe fails or wp-config.php is absent.
 */
export async function resolveRemoteLayout(
  session: SiteSshSession,
  rootPath: string
): Promise<RemoteLayout> {
  const root = normalizeRemoteRoot(rootPath)
  const layout = await detectLayout(session, root)
  const configPath = posixPath.join(layout.webroot, 'wp-config.php')
  const found = await probe(
    session,
    `[ -f ${quoteShellArgument(configPath)} ] && echo yes || echo no`,
    `check for wp-config.php in ${layout.webroot}`
  )
  if (found !== 'yes') {
    // Message ported verbatim from ocsites (deploy/backup.py:486) — users recognise it.
    throw new SiteRunStepError(
      REMOTE_LAYOUT_STEP,
      `wp-config.php not found in ${layout.webroot}. Not a WordPress installation.`
    )
  }
  return layout
}

async function detectLayout(session: SiteSshSession, root: string): Promise<RemoteLayout> {
  // Why: one probe instead of ocsites' four. `-f`/`-d` rather than `-e` so a stray file named
  // `app` cannot be mistaken for Bedrock's content directory.
  const webDocroot = posixPath.join(root, 'web')
  const verdict = await probe(
    session,
    [
      `if [ -f ${quoteShellArgument(posixPath.join(root, 'wp', 'wp-load.php'))} ]`,
      `&& [ -d ${quoteShellArgument(posixPath.join(root, BEDROCK_CONTENT_DIR))} ]`,
      `; then echo bedrock-root`,
      `; elif [ -f ${quoteShellArgument(posixPath.join(webDocroot, 'wp', 'wp-load.php'))} ]`,
      `&& [ -d ${quoteShellArgument(posixPath.join(webDocroot, BEDROCK_CONTENT_DIR))} ]`,
      `; then echo bedrock-web`,
      `; else echo standard; fi`
    ].join(' '),
    `resolve the remote WordPress layout under ${root}`
  )
  if (verdict === 'bedrock-root') {
    return { webroot: root, contentDir: BEDROCK_CONTENT_DIR }
  }
  if (verdict === 'bedrock-web') {
    return { webroot: webDocroot, contentDir: BEDROCK_CONTENT_DIR }
  }
  return { webroot: root, contentDir: STANDARD_CONTENT_DIR }
}

/** Runs a probe that always exits 0 and prints one token, so a non-zero exit is a real failure. */
async function probe(session: SiteSshSession, command: string, what: string): Promise<string> {
  const result = await session.exec(command, { timeoutMs: PROBE_TIMEOUT_MS })
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`
    throw new SiteRunStepError(REMOTE_LAYOUT_STEP, `Could not ${what}: ${detail}`)
  }
  // Why: a chatty remote .bashrc prints its banner on stdout ahead of ours, so read the verdict
  // off the last non-empty line rather than the whole buffer.
  const lines = result.stdout.split('\n')
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index].trim()
    if (line) {
      return line
    }
  }
  return ''
}

function normalizeRemoteRoot(rootPath: string): string {
  const trimmed = rootPath.trim()
  if (!trimmed) {
    throw new SiteRunStepError(
      REMOTE_LAYOUT_STEP,
      'No remote root path is configured for this environment.'
    )
  }
  // Remote paths are POSIX regardless of the machine Muster runs on; keep '/' meaningful but drop
  // a trailing slash so joined probe paths never contain '//'.
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  return withoutTrailingSlash || '/'
}
