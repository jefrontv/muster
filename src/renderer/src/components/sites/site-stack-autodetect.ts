// Decides what a stack-detection answer may write onto the site record.
//
// The stacks are authoritative for their own serving domain, so a confirmed stack's domain
// overwrites a drifted record — that is the point (deploys and search-replace read localDomain).
// Adoption is narrower: only a fully unconfigured record ('plain' with no domain) flips to the
// detected stack, so a deliberate "None" on a configured site is never fought. Two managed stacks
// disagreeing stays a manual decision — switching also switches the DB transport.

import type { SiteLocalStack } from '../../../../shared/site-types'

export type SiteStackAutodetectPatch = {
  localStack?: SiteLocalStack
  localDomain?: string
  localWpRoot?: string
}

const trimSlashes = (value: string): string => value.replace(/^[/\\]+|[/\\]+$/g, '')

export function siteStackAutodetectPatch(
  site: { localStack: SiteLocalStack; localDomain: string; localWpRoot?: string },
  detection: { stack: SiteLocalStack; domain: string; docroot?: string }
): SiteStackAutodetectPatch | null {
  if (detection.stack === 'plain') {
    return null
  }
  const domain = detection.domain.trim()
  if (site.localStack === 'plain' && site.localDomain.trim() === '') {
    return {
      localStack: detection.stack,
      ...(domain ? { localDomain: domain } : {}),
      ...ddevRootPatch(detection, site.localWpRoot)
    }
  }
  if (site.localStack !== detection.stack) {
    return null
  }
  const patch: SiteStackAutodetectPatch = {
    ...(domain && site.localDomain !== domain ? { localDomain: domain } : {}),
    ...ddevRootPatch(detection, site.localWpRoot)
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * DDEV names its docroot, and WP-CLI, eval-file and imports all run in path + localWpRoot. A site
 * moved off LocalWP kept `app/public`, so every MCP WP-CLI call failed in a folder that is gone.
 */
function ddevRootPatch(
  detection: { stack: SiteLocalStack; docroot?: string },
  current = ''
): { localWpRoot?: string } {
  if (detection.stack !== 'ddev' || detection.docroot === undefined) {
    return {}
  }
  const docroot = trimSlashes(detection.docroot)
  return trimSlashes(current) === docroot ? {} : { localWpRoot: docroot }
}
