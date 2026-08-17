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
}

export function siteStackAutodetectPatch(
  site: { localStack: SiteLocalStack; localDomain: string },
  detection: { stack: SiteLocalStack; domain: string }
): SiteStackAutodetectPatch | null {
  if (detection.stack === 'plain') {
    return null
  }
  const domain = detection.domain.trim()
  if (site.localStack === 'plain' && site.localDomain.trim() === '') {
    return domain ? { localStack: detection.stack, localDomain: domain } : { localStack: detection.stack }
  }
  if (site.localStack === detection.stack && domain && site.localDomain !== domain) {
    return { localDomain: domain }
  }
  return null
}
