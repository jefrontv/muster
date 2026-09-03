// Copy for the running/done/failed screens of the redesigned setup dialog. Separate catalog from
// site-setup-strings.ts (the old three-page stepper) since that file is retired by the same
// redesign — new strings, new keys, no shared history to carry forward.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export type SiteSetupRunStrings = {
  stepClone: string
  stepServe: string
  stepHttps: string
  stepImport: string
  stepRegister: string
  runningClone: string
  runningServe: string
  runningHttps: string
  runningImport: string
  cancel: string
  cannotCancel: string
  logLabel: string
  progressLabel: string
  minimizeHint: string
  finishLater: string
  changeAndRetry: string
  adminAccountLabel: string
  adminAccountNotice: string
  copy: string
  copied: string
  close: string
  openSite: string
  skippedPrefix: string
}

export const getSiteSetupRunStrings = createLocalizedCatalog<SiteSetupRunStrings>(() => ({
  stepClone: translate('auto.components.sites.SiteSetupRun.stepClone', 'Clone'),
  stepServe: translate('auto.components.sites.SiteSetupRun.stepServe', 'Serve locally'),
  stepHttps: translate('auto.components.sites.SiteSetupRun.stepHttps', 'HTTPS'),
  stepImport: translate('auto.components.sites.SiteSetupRun.stepImport', 'Import from production'),
  stepRegister: translate('auto.components.sites.SiteSetupRun.stepRegister', 'Register site'),
  // Running labels, one per step — shown while a step has no detail of its own yet to report.
  runningClone: translate('auto.components.sites.SiteSetupRun.runningClone', 'Cloning…'),
  runningServe: translate(
    'auto.components.sites.SiteSetupRun.runningServe',
    'Creating local site…'
  ),
  // LocalWP raises a system password prompt to install its certificate and hosts entry; without
  // this line the row simply looks stuck while that dialog waits behind Muster.
  runningHttps: translate(
    'auto.components.sites.SiteSetupRun.runningHttps',
    'Trusting certificate… (macOS may ask for your password)'
  ),
  runningImport: translate('auto.components.sites.SiteSetupRun.runningImport', 'Importing…'),
  cancel: translate('auto.components.sites.SiteSetupRun.cancel', 'Cancel'),
  cannotCancel: translate(
    'auto.components.sites.SiteSetupRun.cannotCancel',
    "Can't be cancelled while running"
  ),
  logLabel: translate('auto.components.sites.SiteSetupRun.logLabel', 'Log'),
  progressLabel: translate(
    'auto.components.sites.SiteSetupRun.progressLabel',
    '{{done}} of {{total}}'
  ),
  minimizeHint: translate(
    'auto.components.sites.SiteSetupRun.minimizeHint',
    'The dialog can be minimised; the work carries on.'
  ),
  finishLater: translate('auto.components.sites.SiteSetupRun.finishLater', 'Finish later'),
  changeAndRetry: translate(
    'auto.components.sites.SiteSetupRun.changeAndRetry',
    'Change and retry'
  ),
  adminAccountLabel: translate('auto.components.sites.SiteSetupRun.adminAccountLabel', 'wp-admin'),
  adminAccountNotice: translate(
    'auto.components.sites.SiteSetupRun.adminAccountNotice',
    'Local-only account created by LocalWP.'
  ),
  copy: translate('auto.components.sites.SiteSetupRun.copy', 'Copy'),
  copied: translate('auto.components.sites.SiteSetupRun.copied', 'Copied'),
  close: translate('auto.components.sites.SiteSetupRun.close', 'Close'),
  openSite: translate('auto.components.sites.SiteSetupRun.openSite', 'Open {{domain}}'),
  skippedPrefix: translate('auto.components.sites.SiteSetupRun.skippedPrefix', '{{title}} skipped')
}))
