// Keeps the `muster-sites` MCP entry current for every site that has a local checkout.
//
// Without this, an agent only gets the site tools if someone remembers to register them per
// project — which defeats the point of shipping the server in the app. Registration is idempotent
// and repairs a stale path, so this also fixes every project after the app moves or is upgraded.
//
// Deliberately conservative: it only ever REWRITES an entry that is already present but stale, or
// writes into a config file that already exists. It never creates a config file in a project that
// has none — silently adding `.mcp.json` to someone's repo is not ours to do.

import { existsSync } from 'node:fs'
import type { Store } from '../persistence'
import type { SiteMcpTargetStatus } from '../../shared/site-mcp-types'
import {
  DEFAULT_SITE_MCP_CONFIG_PATH,
  readSiteMcpTargets,
  registerSiteMcpServer
} from '../ipc/site-mcp-registration'

export type SiteMcpAutoRegisterResult = {
  scanned: number
  repaired: string[]
  failed: { path: string; reason: string }[]
}

export function autoRegisterSiteMcpServers(store: Store): SiteMcpAutoRegisterResult {
  const result: SiteMcpAutoRegisterResult = { scanned: 0, repaired: [], failed: [] }

  for (const site of store.listSites()) {
    if (!site.path || !existsSync(site.path)) {
      continue
    }
    result.scanned += 1
    let targets: SiteMcpTargetStatus[]
    try {
      targets = readSiteMcpTargets(site.path)
    } catch (error) {
      result.failed.push({
        path: site.path,
        reason: error instanceof Error ? error.message : String(error)
      })
      continue
    }

    // Only a config that exists AND holds a stale entry is rewritten.
    const stale = targets.find((target) => target.exists && target.registered && !target.current)
    if (!stale) {
      continue
    }
    try {
      registerSiteMcpServer(site.path, stale.relativePath || DEFAULT_SITE_MCP_CONFIG_PATH)
      result.repaired.push(stale.absolutePath)
    } catch (error) {
      result.failed.push({
        path: stale.absolutePath,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return result
}
