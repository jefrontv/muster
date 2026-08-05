// Copy for the bind dialog. Split out of SiteBindDialog.tsx so the component stays readable and so
// the module-scope table can be wrapped in createLocalizedCatalog — a bare module-scope translate()
// would be captured at import time and never refresh after a language change.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteBindStrings = createLocalizedCatalog(() => ({
  title: translate('auto.components.sites.SiteBindDialog.title', 'Configure a site from a link'),
  description: translate(
    'auto.components.sites.SiteBindDialog.description',
    'A muster:// link wants to write this deployment configuration. Nothing is saved until you confirm.'
  ),
  willStore: translate('auto.components.sites.SiteBindDialog.willStore', 'What will be stored'),
  chooseFolder: translate(
    'auto.components.sites.SiteBindDialog.chooseFolder',
    'Which local folder should this bind to?'
  ),
  clone: translate('auto.components.sites.SiteBindDialog.clone', 'Clone into a folder…'),
  cloning: translate('auto.components.sites.SiteBindDialog.cloning', 'Cloning…'),
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
  missingFolder: translate(
    'auto.components.sites.SiteBindDialog.missingFolder',
    'Its folder is gone, so this record cannot be bound. Choose or clone a folder to set it up fresh.'
  ),
  setUpInRoot: translate(
    'auto.components.sites.SiteBindDialog.setUpInRoot',
    'Set up in {{folder}}'
  ),
  settingUp: translate('auto.components.sites.SiteBindDialog.settingUp', 'Setting up…'),
  willCreateAt: translate(
    'auto.components.sites.SiteBindDialog.willCreateAt',
    'Muster will clone into {{path}} and configure it.'
  ),
  noRootConfigured: translate(
    'auto.components.sites.SiteBindDialog.noRootConfigured',
    'No projects folder is configured yet. Choose a folder below, or set your default folders in Sites → Folders.'
  ),
  confirm: translate('auto.components.sites.SiteBindDialog.confirm', 'Bind this site'),
  confirming: translate('auto.components.sites.SiteBindDialog.confirming', 'Binding…'),
  cancel: translate('auto.components.sites.SiteBindDialog.cancel', 'Cancel'),
  boundToast: translate('auto.components.sites.SiteBindDialog.boundToast', 'Site configured'),
  secretFailedToast: translate(
    'auto.components.sites.SiteBindDialog.secretFailedToast',
    'Site configured, but the password could not be stored'
  ),
  cloneFailedToast: translate(
    'auto.components.sites.SiteBindDialog.cloneFailedToast',
    'Clone failed'
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
