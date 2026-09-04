// Copy for the link (muster://) rows of the setup dialog and the field labels the link's summary
// table uses. A catalog rather than a bare module-scope object so it refreshes on language change.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteBindStrings = createLocalizedCatalog(() => ({
  chooseFolder: translate(
    'auto.components.sites.SiteBindDialog.chooseFolder',
    'Which local folder should this bind to?'
  ),
  folderTitle: translate('auto.components.sites.SiteBindDialog.folderTitle', 'Folder'),
  credentialsTitle: translate(
    'auto.components.sites.SiteBindDialog.credentialsTitle',
    'Credentials'
  ),
  existingCheckout: translate(
    'auto.components.sites.SiteBindDialog.existingCheckout',
    'Existing checkout'
  ),
  cloneOption: translate('auto.components.sites.SiteBindDialog.cloneOption', 'Clone {{repo}}'),
  chooseAnother: translate(
    'auto.components.sites.SiteBindDialog.chooseAnother',
    'Choose another folder…'
  ),
  allFields: translate(
    'auto.components.sites.SiteBindDialog.allFields',
    'All fields from the link ({{count}})'
  ),
  noCandidates: translate(
    'auto.components.sites.SiteBindDialog.noCandidates',
    'No local checkout matches this repository yet.'
  ),
  passwordNotice: translate(
    'auto.components.sites.SiteBindDialog.passwordNotice',
    'The link carries an SSH password. It is stored in your OS keychain and never shown again.'
  ),
  noPasswordNotice: translate(
    'auto.components.sites.SiteBindDialog.noPasswordNotice',
    'The link carries no password, so no credential will be stored.'
  ),
  updatesExisting: translate(
    'auto.components.sites.SiteBindDialog.updatesExisting',
    'This folder already has a site record; confirming updates it.'
  ),
  // One line for all of them, rather than an unpickable card each repeating the same sentence. The
  // fact still matters — it explains why a site the user knows about is not on offer — but it is a
  // footnote, not the choice.
  staleRecords: translate(
    'auto.components.sites.SiteBindDialog.staleRecords',
    '{{count}} earlier record points at a folder that is gone.'
  ),
  staleRecordsPlural: translate(
    'auto.components.sites.SiteBindDialog.staleRecordsPlural',
    '{{count}} earlier records point at folders that are gone.'
  )
}))

/** Field labels, in the order the dialog lists them. */
export const getSiteBindFieldLabels = createLocalizedCatalog(() => ({
  reponame: translate('auto.components.sites.SiteBindDialog.reponame', 'Repository'),
  hostname: translate('auto.components.sites.SiteBindDialog.hostname', 'SSH host'),
  username: translate('auto.components.sites.SiteBindDialog.username', 'SSH user'),
  rootPath: translate('auto.components.sites.SiteBindDialog.rootPath', 'Remote root'),
  liveDomain: translate('auto.components.sites.SiteBindDialog.liveDomain', 'Live domain'),
  localDomain: translate('auto.components.sites.SiteBindDialog.localDomain', 'Local domain'),
  environment: translate('auto.components.sites.SiteBindDialog.environment', 'Environment'),
  deployCommand: translate('auto.components.sites.SiteBindDialog.deployCommand', 'Build command'),
  themeDistPath: translate('auto.components.sites.SiteBindDialog.themeDistPath', 'Theme dist path'),
  notes: translate('auto.components.sites.SiteBindDialog.notes', 'Notes')
}))
