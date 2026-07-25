// Builds the child-process environment that lets WP-CLI (search-replace, option queries) run
// against a LocalWP site: Local's own PHP binary plus PHPRC/MYSQL_HOME pointing at the per-site
// conf directory so the client finds the site's Unix socket.
//
// Ported from ocsites create_localwp.localwp_wp_env.

import path from 'node:path'
import {
  listServiceDirectories,
  readSitePhpVersion,
  siteIdFromSocketPath
} from './localwp-detection'
import {
  isLocalWpSupported,
  localWpServicesDirectory,
  localWpSupportDirectory,
  type LocalWpHost
} from './localwp-host'

const WP_CLI_POSIX_DIRECTORY =
  '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/posix'

/**
 * Null when Local's directories cannot be located — the caller then falls back to a plain
 * environment rather than running WP-CLI against a half-configured PHP.
 */
export async function buildLocalWpWpEnv(
  host: LocalWpHost,
  socketPath: string
): Promise<Record<string, string> | null> {
  const siteId = isLocalWpSupported(host) ? siteIdFromSocketPath(socketPath) : null
  if (!siteId) {
    return null
  }
  const confDirectory = path.join(localWpSupportDirectory(host), 'run', siteId, 'conf')
  if (!(await host.pathExists(confDirectory))) {
    return null
  }
  if (!(await host.pathExists(WP_CLI_POSIX_DIRECTORY))) {
    return null
  }
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(host.environment)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  env.PHPRC = path.join(confDirectory, 'php')
  env.MYSQL_HOME = path.join(confDirectory, 'mysql')
  env.WP_CLI_DISABLE_AUTO_CHECK_UPDATE = '1'
  // Xdebug adds only overhead and noisy startup warnings to a long search-replace.
  env.XDEBUG_MODE = 'off'
  const wpCliConfig = path.join(path.dirname(WP_CLI_POSIX_DIRECTORY), 'config.yaml')
  if (await host.pathExists(wpCliConfig)) {
    env.WP_CLI_CONFIG_PATH = wpCliConfig
  }
  const searchPath = [WP_CLI_POSIX_DIRECTORY]
  const phpBinDirectory = await resolveSitePhpBinDirectory(host, siteId)
  if (phpBinDirectory) {
    searchPath.push(phpBinDirectory)
  }
  env.PATH = `${searchPath.join(':')}:${env.PATH ?? ''}`
  return env
}

/**
 * The PHP build matching the SITE's configured version, not the newest installed. PHPRC loads the
 * Xdebug extension built for the site's PHP version, and running a different PHP binary against it
 * aborts with "Xdebug requires Zend Engine API version …". Falls back to newest only if no match.
 */
async function resolveSitePhpBinDirectory(
  host: LocalWpHost,
  siteId: string
): Promise<string | null> {
  const phpDirectories = await listServiceDirectories(host, 'php-')
  const sitePhp = await readSitePhpVersion(host, siteId)
  const exact = sitePhp
    ? phpDirectories.find((name) => name === `php-${sitePhp}` || name.startsWith(`php-${sitePhp}+`))
    : undefined
  const ordered = exact ? [exact, ...phpDirectories] : phpDirectories
  for (const name of ordered) {
    // Local ships per-arch builds; probe both so Intel Macs are not silently skipped.
    for (const arch of ['darwin-arm64', 'darwin-x64']) {
      const binDirectory = path.join(localWpServicesDirectory(host), name, 'bin', arch, 'bin')
      if (await host.pathExists(binDirectory)) {
        return binDirectory
      }
    }
  }
  return null
}
