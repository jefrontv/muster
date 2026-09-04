// Copy for the "add a site from a connected git host" picker. Wrapped in createLocalizedCatalog
// for the same reason as the other site catalogs: a bare module-scope translate() is captured at
// import time and never refreshes after a language change.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteCloneSourceStrings = createLocalizedCatalog(() => ({
  trigger: translate('auto.components.sites.CloneSource.trigger', 'New site'),
  search: translate('auto.components.sites.CloneSource.search', 'Search repositories'),
  back: translate('auto.components.sites.CloneSource.back', 'Back'),
  loading: translate('auto.components.sites.CloneSource.loading', 'Loading repositories…'),
  empty: translate('auto.components.sites.CloneSource.empty', 'No repositories match.'),
  searching: translate('auto.components.sites.CloneSource.searching', 'Searching repositories…'),
  // A function, not a value: the typed term is only known at render time, and the catalog is
  // rebuilt per language so the lookup still follows a language change.
  noMatch: (query: string): string =>
    translate('auto.components.sites.CloneSource.noMatch', 'No repositories match “{{query}}”.', {
      query
    }),
  noProviders: translate(
    'auto.components.sites.CloneSource.noProviders',
    'No git hosts are connected yet.'
  ),
  truncated: translate(
    'auto.components.sites.CloneSource.truncated',
    'Showing the most recent repositories. Search to reach any repository on the host, not only these.'
  ),
  truncatedLocal: translate(
    'auto.components.sites.CloneSource.truncatedLocal',
    'Showing the most recent repositories. This host cannot search, so the box only filters these.'
  ),
  chooseFolder: translate('auto.components.sites.CloneSource.chooseFolder', 'Clone into…'),
  cancel: translate('auto.components.sites.CloneSource.cancel', 'Cancel')
}))
