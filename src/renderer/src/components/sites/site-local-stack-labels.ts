// Display names for local stacks. Product names stay untranslated; "None" is the absence of one.

import type { SiteLocalStack } from '../../../../shared/site-types'
import { translate } from '@/i18n/i18n'

const PRODUCT_NAMES: Record<Exclude<SiteLocalStack, 'plain'>, string> = {
  mamp: 'MAMP',
  localwp: 'LocalWP',
  'agent-local': 'Agent Local',
  ddev: 'DDEV'
}

export function siteLocalStackLabel(stack: SiteLocalStack): string {
  return stack === 'plain'
    ? translate('auto.components.sites.SiteLocalStackCard.stackNone', 'None')
    : PRODUCT_NAMES[stack]
}

/** The stacks worth a badge on a site row: `plain` adds a chip that says nothing. */
export function siteLocalStackBadge(stack: SiteLocalStack): string | null {
  return stack === 'plain' ? null : PRODUCT_NAMES[stack]
}
