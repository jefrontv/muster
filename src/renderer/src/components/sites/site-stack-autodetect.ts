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
      ...docrootPatch(detection, site.localWpRoot)
    }
  }
  if (site.localStack !== detection.stack) {
    return null
  }
  const patch: SiteStackAutodetectPatch = {
    ...(domain && site.localDomain !== domain ? { localDomain: domain } : {}),
    ...docrootPatch(detection, site.localWpRoot)
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * WP-CLI, eval-file and imports all run in path + localWpRoot. DDEV names its docroot (a site moved
 * off LocalWP kept `app/public`); LocalWP's `app/public` is only ever added, never cleared, so an
 * adopted LocalWP site stops importing into the site shell.
 */
function docrootPatch(
  detection: { stack: SiteLocalStack; docroot?: string },
  current = ''
): { localWpRoot?: string } {
  if (detection.docroot === undefined) {
    return {}
  }
  const docroot = trimSlashes(detection.docroot)
  if (detection.stack !== 'ddev' && !(detection.stack === 'localwp' && docroot !== '')) {
    return {}
  }
  return trimSlashes(current) === docroot ? {} : { localWpRoot: docroot }
}
