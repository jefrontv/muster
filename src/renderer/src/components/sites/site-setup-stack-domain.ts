// The domain field follows the stack: DDEV serves `<project>.ddev.site`, the others take any name.

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

/** DDEV only reads the first label (the project name); it keeps a port DDEV already reported. */
export function domainForStack(
  domain: string,
  stack: SiteLocalStack | null,
  previous: SiteLocalStack | null = null
): string {
  const label = firstLabel(domain)
  if (label.length === 0) {
    return domain
  }
  if (stack === 'ddev') {
    return domain.includes(`.${DDEV_TLD}`) ? domain : `${label}.${DDEV_TLD}`
  }
  if (previous === 'ddev' && domain.includes(`.${DDEV_TLD}`)) {
    return `${label}.local`
  }
  return domain
}
