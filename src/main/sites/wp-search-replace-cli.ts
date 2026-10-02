// How the search-replace step finds and spawns WP-CLI: host `wp` (under LocalWP's PHP when the site
// is on a socket) or `ddev wp` in the container, with ABSPATH mapped to the path WP-CLI will see.

import { stat } from 'node:fs/promises'
import path from 'node:path'
import { streamCommand, type StreamCommandResult } from '../lib/stream-command'
import {
  buildLocalWpCliSpawn,
  ddevWpCliSpawnError,
  resolveDdevWpCli,
  toDdevContainerPath
} from './local-wp-cli-command'
import { SiteRunCancelledError, type SiteRunConfig, type SiteRunContext } from './pipeline-contract'

/** Resolves LocalWP's PHP/socket environment; injected so tests need no Local.app. */
export type LocalWpEnvironmentResolver = (
  socketPath: string
) => Promise<Record<string, string> | null>

/**
 * The `--path` WP-CLI sees: the host ABSPATH, or its container path for DDEV. Null (logged as the
 * usual degrade) when a DDEV site has no project to run in.
 */
export function resolveCliPath(
  context: SiteRunContext,
  config: SiteRunConfig,
  abspath: string
): string | null {
  if (config.site.localStack !== 'ddev') {
    return abspath
  }
  try {
    return toDdevContainerPath(resolveDdevWpCli(config.wpDir).projectRoot, abspath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    context.log(`⚠ Skipping WP Search and Replace: ${detail}`)
    return null
  }
}

/** Null when WP-CLI could not be run at all — logged as a degrade, not an import failure. */
export async function runWpCli(
  context: SiteRunContext,
  config: SiteRunConfig,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<StreamCommandResult | null> {
  const isDdev = config.site.localStack === 'ddev'
  try {
    const spawn = buildLocalWpCliSpawn({
      localStack: config.site.localStack,
      wpDir: config.wpDir,
      args,
      env
    })
    try {
      return await streamCommand(spawn.command, spawn.args, {
        cwd: spawn.cwd,
        env: spawn.env,
        signal: context.signal,
        timeoutMs
      })
    } catch (error) {
      if (isDdev && !(error instanceof Error && error.name === 'AbortError')) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(ddevWpCliSpawnError(spawn.cwd, detail))
      }
      throw error
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SiteRunCancelledError()
    }
    // Degrade rather than fail the whole import: the database is already in place, only the
    // domain rewrite is missing, and the user can finish it by hand.
    const detail = error instanceof Error ? error.message : String(error)
    context.log(
      isDdev
        ? `⚠ Skipping WP Search and Replace: ${detail}`
        : `⚠ Skipping WP Search and Replace: WP-CLI (\`wp\`) could not be run — install WP-CLI and re-run the import, or run it manually in ${config.wpDir}. (${detail})`
    )
    return null
  }
}

/**
 * ABSPATH for WP-CLI's `--path`. Standard installs keep core at wpDir; Bedrock keeps it at
 * wpDir/wp with wp-config.php one level up, which WP-CLI still finds by walking upwards.
 */
export async function resolveWpCliPath(wpDir: string): Promise<string> {
  try {
    await stat(path.join(wpDir, 'wp', 'wp-load.php'))
    return path.join(wpDir, 'wp')
  } catch {
    return wpDir
  }
}

/** wp-load.php is what WP-CLI itself looks for when it reports "not a WordPress installation". */
export async function hasWordPressCore(abspath: string): Promise<boolean> {
  try {
    await stat(path.join(abspath, 'wp-load.php'))
    return true
  } catch {
    return false
  }
}

export async function resolveWpEnvironment(
  context: SiteRunContext,
  config: SiteRunConfig,
  resolveLocalWpEnvironment: LocalWpEnvironmentResolver
): Promise<NodeJS.ProcessEnv> {
  let localWpEnvironment: Record<string, string> | null = null
  if (config.site.dbSocket) {
    // The system `wp` runs system PHP, which knows nothing about Local's per-site MySQL socket.
    localWpEnvironment = await resolveLocalWpEnvironment(config.site.dbSocket)
    context.log(
      localWpEnvironment
        ? 'Using LocalWP PHP environment for WP-CLI…'
        : 'LocalWP env not found — falling back to system WP-CLI…'
    )
  }
  return {
    ...(localWpEnvironment ?? process.env),
    // WP-CLI bootstraps the site's wp-config; a benign PHP warning on stderr would otherwise
    // abort an otherwise-fine search-replace. Real errors still surface.
    WP_CLI_PHP_ARGS: '-d error_reporting=E_ERROR -d display_errors=0'
  }
}
