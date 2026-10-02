// What the Serve row's domain may be. DDEV serves `<project>.ddev.site`, so for DDEV only the
// project name is the user's to choose, under DDEV's own naming rules.

import { translate } from '@/i18n/i18n'

export const DDEV_SITE_SUFFIX = '.ddev.site'

const DDEV_NAME_MAX = 63
const DDEV_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** The project name in a stored value, a pasted domain or a URL: its first label. */
export function ddevNameFromValue(value: string): string {
  return (
    value
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/[/:].*$/, '')
      .split('.')[0] ?? ''
  )
}

/** Typing as DDEV slugs folder names: lowercase, spaces and underscores become hyphens. */
export function normalizeDdevName(input: string): string {
  return ddevNameFromValue(input)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

export function ddevDomainFromName(name: string): string {
  return `${name}${DDEV_SITE_SUFFIX}`
}

/** Empty when the name is usable; otherwise the sentence to show under the field. */
export function ddevNameError(name: string): string {
  if (name.length === 0) {
    return translate(
      'auto.components.sites.siteSetupDomainRules.nameRequired',
      'Enter a project name.'
    )
  }
  if (name.length > DDEV_NAME_MAX) {
    return translate(
      'auto.components.sites.siteSetupDomainRules.nameTooLong',
      'Use at most {{max}} characters.'
    ).replace('{{max}}', String(DDEV_NAME_MAX))
  }
  if (!DDEV_NAME_PATTERN.test(name)) {
    return translate(
      'auto.components.sites.siteSetupDomainRules.nameCharacters',
      'Use letters, digits and hyphens, not starting or ending with a hyphen.'
    )
  }
  return ''
}
