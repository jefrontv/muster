// Copy for the "add a site from a connected git host" picker. Wrapped in createLocalizedCatalog
// for the same reason as the other site catalogs: a bare module-scope translate() is captured at
// import time and never refreshes after a language change.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteCloneSourceStrings = createLocalizedCatalog(() => ({
  trigger: translate('auto.components.sites.CloneSource.trigger', 'New site'),
  title: translate('auto.components.sites.CloneSource.title', 'New site from a repository'),
  description: translate(
    'auto.components.sites.CloneSource.description',
    'Pick a repository from a connected git host. Muster clones it and adds it as a site.'
  ),
  search: translate('auto.components.sites.CloneSource.search', 'Search repositories'),
  destinationPrefix: translate(
    'auto.components.sites.CloneSource.destinationPrefix',
    'Clones into'
  ),
  confirmTitle: translate(
    'auto.components.sites.CloneSource.confirmTitle',
    'Clone this repository?'
  ),
  confirmInto: translate('auto.components.sites.CloneSource.confirmInto', 'Clones into'),
  confirmNext: translate(
    'auto.components.sites.CloneSource.confirmNext',
    'Afterwards you can set it up as a LocalWP site, trust its HTTPS certificate, and pull the server content down.'
  ),
  confirmAction: translate('auto.components.sites.CloneSource.confirmAction', 'Clone repository'),
  back: translate('auto.components.sites.CloneSource.back', 'Back'),
  cloningTitle: translate('auto.components.sites.CloneSource.cloningTitle', 'Cloning'),
  cloneStarting: translate('auto.components.sites.CloneSource.cloneStarting', 'Starting clone…'),
  cloneRegistering: translate(
    'auto.components.sites.CloneSource.cloneRegistering',
    'Registering the site…'
  ),
  setupTitle: translate('auto.components.sites.CloneSource.setupTitle', 'Finish setting up'),
  done: translate('auto.components.sites.CloneSource.done', 'Done'),
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
  cloning: translate('auto.components.sites.CloneSource.cloning', 'Cloning…'),
  adding: translate('auto.components.sites.CloneSource.adding', 'Adding site…'),
  cancel: translate('auto.components.sites.CloneSource.cancel', 'Cancel'),
  privateLabel: translate('auto.components.sites.CloneSource.privateLabel', 'Private'),
  clonedToast: translate('auto.components.sites.CloneSource.clonedToast', 'Site added'),
  failedToast: translate('auto.components.sites.CloneSource.failedToast', 'Could not add the site')
}))
