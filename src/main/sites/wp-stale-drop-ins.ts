// Production's caching drop-ins arrive in wp-content.zip and point at production paths.
//
// WordPress loads `wp-content/advanced-cache.php` on every front-end request when WP_CACHE is on,
// before any plugin. WP Rocket's copy hard-codes the server's plugin and cache directories
// (`/home/<user>/public_html/...`), so on this machine it fails to find itself and the page comes
// out as a 200 with an empty body - while /wp-json and /wp-admin, which bypass it, work fine.
// The same goes for `object-cache.php` (Redis/Memcached drop-ins pointing at a server socket).
//
// A stale drop-in is renamed, not deleted: the plugin regenerates a correct one when its admin
// loads, and the original stays beside it for anyone who wants to see what production had.

import { readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { SiteRunCancelledError, type SiteRunConfig, type SiteRunContext } from './pipeline-contract'

const DROP_INS = ['advanced-cache.php', 'object-cache.php'] as const
export const STALE_DROP_IN_SUFFIX = '.stale-production'

/** Absolute POSIX paths the drop-in names; only these can tell a production copy from a local one. */
const ABSOLUTE_PATH = /(?:'|")(\/(?:[^'"\s]+\/)*[^'"\s]*)(?:'|")/g

/**
 * True when the drop-in names an absolute path that is not under this checkout. A drop-in the local
 * plugin generated names local paths and stays; one with none at all is left alone too, since
 * nothing about it says where it came from.
 */
export function dropInPointsElsewhere(contents: string, wpDir: string): boolean {
  const localRoot = path.resolve(wpDir) + path.sep
  let sawPath = false
  for (const match of contents.matchAll(ABSOLUTE_PATH)) {
    const named = match[1] ?? ''
    // Only filesystem paths: a URL path like "/wp-content/cache/" has no directory above the root.
    if (!/^\/(?:home|Users|var|srv|opt|www|mnt|data)\//.test(named)) {
      continue
    }
    sawPath = true
    if (path.resolve(named).startsWith(localRoot) || path.resolve(named) === path.resolve(wpDir)) {
      return false
    }
  }
  return sawPath
}

export async function cleanUpStaleDropIns(
  context: SiteRunContext,
  config: SiteRunConfig
): Promise<void> {
  const contentDir = path.join(config.wpDir, 'wp-content')
  for (const name of DROP_INS) {
    const dropInPath = path.join(contentDir, name)
    let contents: string
    try {
      contents = await readFile(dropInPath, 'utf8')
    } catch {
      continue
    }
    if (!dropInPointsElsewhere(contents, config.wpDir)) {
      continue
    }
    try {
      await rename(dropInPath, `${dropInPath}${STALE_DROP_IN_SUFFIX}`)
      context.log(
        `Set aside wp-content/${name}: it points at production paths and would serve an empty page here (kept as ${name}${STALE_DROP_IN_SUFFIX}).`
      )
    } catch (error) {
      if (error instanceof SiteRunCancelledError) {
        throw error
      }
      context.log(
        `⚠ Could not set aside wp-content/${name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
