// The domain field follows the stack: DDEV serves `<project>.ddev.site`, agent-local proposes its own
// configured suffix, and the others take any name.

import type { SiteLocalStack } from '../../../../shared/site-types'

const DDEV_TLD = 'ddev.site'

function firstLabel(domain: string): string {
  return (
    domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/:\d+$/, '')
      .split('.')[0] ?? ''
  )
}

const GENERIC_SUFFIX = '.local'

/**
 * DDEV only reads the first label (the project name); it keeps a port DDEV already reported.
 * Only a default-shaped domain is re-suffixed; a name the user typed is left alone.
 */
export function domainForStack(
  domain: string,
  stack: SiteLocalStack | null,
  previous: SiteLocalStack | null = null,
  agentLocalSuffix: string | null = null
): string {
  const label = firstLabel(domain)
  if (label.length === 0) {
    return domain
  }
  if (stack === 'ddev') {
    return domain.includes(`.${DDEV_TLD}`) ? domain : `${label}.${DDEV_TLD}`
  }
  const isDdevDefault = previous === 'ddev' && domain.includes(`.${DDEV_TLD}`)
  const isGenericDefault = domain === `${label}${GENERIC_SUFFIX}`
  if (stack === 'agent-local' && agentLocalSuffix && (isGenericDefault || isDdevDefault)) {
    return `${label}${agentLocalSuffix}`
  }
  const isAgentLocalDefault =
    previous === 'agent-local' &&
    agentLocalSuffix !== null &&
    domain === `${label}${agentLocalSuffix}`
  if (isDdevDefault || isAgentLocalDefault) {
    return `${label}${GENERIC_SUFFIX}`
  }
  return domain
}
