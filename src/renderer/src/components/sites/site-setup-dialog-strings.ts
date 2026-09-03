// Copy for the setup dialog shell: headers per screen and the one consent button.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteSetupDialogStrings = createLocalizedCatalog(() => ({
  sourceTitle: translate('auto.components.sites.SiteSetupDialog.sourceTitle', 'New site'),
  sourceDescription: translate(
    'auto.components.sites.SiteSetupDialog.sourceDescription',
    'Pick a repository. Nothing is cloned until you review.'
  ),
  reviewTitle: translate('auto.components.sites.SiteSetupDialog.reviewTitle', 'Set up {{label}}'),
  reviewRepoDescription: translate(
    'auto.components.sites.SiteSetupDialog.reviewRepoDescription',
    'From {{repo}} · Nothing is written until you continue.'
  ),
  reviewLinkDescription: translate(
    'auto.components.sites.SiteSetupDialog.reviewLinkDescription',
    'A muster:// link wants to configure this site. Nothing is saved until you continue.'
  ),
  reviewSiteDescription: translate(
    'auto.components.sites.SiteSetupDialog.reviewSiteDescription',
    'Finish what is not set up yet.'
  ),
  runningTitle: translate(
    'auto.components.sites.SiteSetupDialog.runningTitle',
    'Setting up {{label}}'
  ),
  doneTitle: translate('auto.components.sites.SiteSetupDialog.doneTitle', '{{label}} is ready'),
  finishedWithProblemsTitle: translate(
    'auto.components.sites.SiteSetupDialog.finishedWithProblemsTitle',
    '{{label}} needs attention'
  ),
  back: translate('auto.components.sites.SiteSetupDialog.back', 'Back'),
  cancel: translate('auto.components.sites.SiteSetupDialog.cancel', 'Cancel'),
  setUp: translate('auto.components.sites.SiteSetupDialog.setUp', 'Set up site'),
  retry: translate('auto.components.sites.SiteSetupDialog.retry', 'Retry'),
  chooseTarget: translate(
    'auto.components.sites.SiteSetupDialog.chooseTarget',
    'Choose a folder to continue.'
  ),
  loading: translate('auto.components.sites.SiteSetupDialog.loading', 'Checking this machine…'),
  secretFailedToast: translate(
    'auto.components.sites.SiteSetupDialog.secretFailedToast',
    'Site saved, but the password could not be stored'
  ),
  stageConfirm: translate('auto.components.sites.SiteSetupDialog.stageConfirm', 'Needs a decision'),
  stageClone: translate('auto.components.sites.SiteSetupDialog.stageClone', 'Cloning'),
  stageRegister: translate('auto.components.sites.SiteSetupDialog.stageRegister', 'Saving site'),
  stageServe: translate('auto.components.sites.SiteSetupDialog.stageServe', 'Creating local site'),
  stageHttps: translate('auto.components.sites.SiteSetupDialog.stageHttps', 'Trusting certificate'),
  stageImport: translate('auto.components.sites.SiteSetupDialog.stageImport', 'Importing'),
  stageDone: translate('auto.components.sites.SiteSetupDialog.stageDone', 'Ready'),
  stageFailed: translate('auto.components.sites.SiteSetupDialog.stageFailed', 'Needs attention')
}))
