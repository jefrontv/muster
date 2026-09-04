// Copy for the Source screen (plan doc "Screen 1 — Source"). Split from site-clone-source-strings
// because that catalog covers the picker copy that survives unchanged (search, provider labels,
// truncation notices); this one is the new material introduced by the redesign — the destination
// field, the "choose a folder first" guard, and the provider action buttons.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteSetupSourceStrings = createLocalizedCatalog(() => ({
  destinationLabel: translate(
    'auto.components.sites.SiteSetupSourceScreen.destinationLabel',
    'Clone into'
  ),
  destinationPlaceholder: translate(
    'auto.components.sites.SiteSetupSourceScreen.destinationPlaceholder',
    'Choose a folder'
  ),
  destinationEditLabel: translate(
    'auto.components.sites.SiteSetupSourceScreen.destinationEditLabel',
    'Change the destination folder'
  ),
  chooseFolderFirst: translate(
    'auto.components.sites.SiteSetupSourceScreen.chooseFolderFirst',
    'Choose a folder first.'
  ),
  openIntegrationsSettings: translate(
    'auto.components.sites.SiteSetupSourceScreen.openIntegrationsSettings',
    'Open Settings → Integrations'
  ),
  copyCommand: translate('auto.components.sites.SiteSetupSourceScreen.copyCommand', 'Copy command'),
  copyCommandCopiedToast: translate(
    'auto.components.sites.SiteSetupSourceScreen.copyCommandCopiedToast',
    'Copied'
  ),
  cancel: translate('auto.components.sites.SiteSetupSourceScreen.cancel', 'Cancel')
}))
