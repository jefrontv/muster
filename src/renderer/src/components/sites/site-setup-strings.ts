// Copy for the post-bind guided setup. Separate catalog from site-bind-strings so the consent
// dialog's wording stays independent of the follow-on stages, and wrapped in
// createLocalizedCatalog for the same reason: a bare module-scope translate() would be captured at
// import time and never refresh after a language change.

import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSiteSetupStrings = createLocalizedCatalog(() => ({
  title: translate('auto.components.sites.SiteSetupContinuation.title', 'Finish setting up'),
  description: translate(
    'auto.components.sites.SiteSetupContinuation.description',
    'The site is saved. These optional steps get it running locally.'
  ),
  loading: translate(
    'auto.components.sites.SiteSetupContinuation.loading',
    'Checking what this site needs…'
  ),
  stackHeading: translate(
    'auto.components.sites.SiteSetupContinuation.stackHeading',
    'Local WordPress'
  ),
  stackBody: translate(
    'auto.components.sites.SiteSetupContinuation.stackBody',
    'Register this folder with LocalWP so it can be served and given a database.'
  ),
  // The two states this stage can be in, phrased for what actually happens to the folder. ocsites
  // called them setup_localwp_before_clone and _migrate_to_localwp.
  stackCreateBody: translate(
    'auto.components.sites.SiteSetupContinuation.stackCreateBody',
    'No WordPress here yet. Register the folder with LocalWP, then pull the site down with the import step.'
  ),
  stackCreateAction: translate(
    'auto.components.sites.SiteSetupContinuation.stackCreateAction',
    'Create LocalWP site'
  ),
  stackMoves: translate(
    'auto.components.sites.SiteSetupContinuation.stackMoves',
    '{{count}} project entries move into app/public'
  ),
  stackDeletes: translate(
    'auto.components.sites.SiteSetupContinuation.stackDeletes',
    '{{count}} existing entries under app/public are deleted first'
  ),
  stackAction: translate(
    'auto.components.sites.SiteSetupContinuation.stackAction',
    'Set up LocalWP'
  ),
  // Shown only when more than one stack is installed, so the label names the choice rather than
  // explaining what a local stack is.
  stackPickerLabel: translate(
    'auto.components.sites.SiteSetupContinuation.stackPickerLabel',
    'Run this site with'
  ),
  stackAgentLocalBody: translate(
    'auto.components.sites.SiteSetupContinuation.stackAgentLocalBody',
    'Serve this folder where it is with agent-local, on its own domain and database.'
  ),
  stackAgentLocalAction: translate(
    'auto.components.sites.SiteSetupContinuation.stackAgentLocalAction',
    'Set up agent-local'
  ),
  stackAgentLocalServesInPlace: translate(
    'auto.components.sites.SiteSetupContinuation.stackAgentLocalServesInPlace',
    'Nothing moves — the folder is served where it is'
  ),
  stackPreviewing: translate(
    'auto.components.sites.SiteSetupContinuation.stackPreviewing',
    'Checking…'
  ),
  stackRunning: translate(
    'auto.components.sites.SiteSetupContinuation.stackRunning',
    'Setting up…'
  ),
  stackConfirm: translate('auto.components.sites.SiteSetupContinuation.stackConfirm', 'Run setup'),
  stackDone: translate(
    'auto.components.sites.SiteSetupContinuation.stackDone',
    'LocalWP site ready.'
  ),
  // The Local app raises a system password prompt to install its site certificate and hosts entry.
  // Nothing moves until that is answered, and it opens behind Muster — without this line the setup
  // simply looks frozen.
  stackOsPasswordHint: translate(
    'auto.components.sites.SiteSetupContinuation.stackOsPasswordHint',
    'LocalWP may ask for your macOS password — check the Local app.'
  ),
  // agent-local writes to /etc/hosts and the System keychain. With the one-time grant in place it
  // never prompts; without it the prompt goes to a background process that cannot show one, so the
  // setup would hang with no visible cause.
  stackAgentLocalSudoHint: translate(
    'auto.components.sites.SiteSetupContinuation.stackAgentLocalSudoHint',
    'If this stalls, run `agent-local sudo` once in a terminal to grant hosts and certificate access.'
  ),
  stackLogLabel: translate(
    'auto.components.sites.SiteSetupContinuation.stackLogLabel',
    'Setup progress'
  ),
  stackFailed: translate(
    'auto.components.sites.SiteSetupContinuation.stackFailed',
    'LocalWP setup did not finish.'
  ),
  stackRetry: translate('auto.components.sites.SiteSetupContinuation.stackRetry', 'Try again'),
  stackDomainLabel: translate(
    'auto.components.sites.SiteSetupContinuation.stackDomainLabel',
    'Local domain'
  ),
  certHeading: translate(
    'auto.components.sites.SiteSetupContinuation.certHeading',
    'HTTPS certificate'
  ),
  certAction: translate(
    'auto.components.sites.SiteSetupContinuation.certAction',
    'Trust certificate'
  ),
  certTrusting: translate('auto.components.sites.SiteSetupContinuation.certTrusting', 'Trusting…'),
  certTrusted: translate(
    'auto.components.sites.SiteSetupContinuation.certTrusted',
    'Trusted — the local site loads over https without a warning.'
  ),
  importHeading: translate(
    'auto.components.sites.SiteSetupContinuation.importHeading',
    'Import from the server'
  ),
  importBody: translate(
    'auto.components.sites.SiteSetupContinuation.importBody',
    'Pull the remote database and files down to this checkout.'
  ),
  importAction: translate(
    'auto.components.sites.SiteSetupContinuation.importAction',
    'Run import now'
  ),
  importStarting: translate(
    'auto.components.sites.SiteSetupContinuation.importStarting',
    'Starting…'
  ),
  importRunning: translate(
    'auto.components.sites.SiteSetupContinuation.importRunning',
    'Importing from the server…'
  ),
  importSucceeded: translate(
    'auto.components.sites.SiteSetupContinuation.importSucceeded',
    'Import complete.'
  ),
  importFailed: translate(
    'auto.components.sites.SiteSetupContinuation.importFailed',
    'Import failed.'
  ),
  importCancelled: translate(
    'auto.components.sites.SiteSetupContinuation.importCancelled',
    'Import cancelled.'
  ),
  importBlocked: translate(
    'auto.components.sites.SiteSetupContinuation.importBlocked',
    'Import was blocked before it started.'
  ),
  importProgress: translate(
    'auto.components.sites.SiteSetupContinuation.importProgress',
    '{{stage}} · {{percent}}%'
  ),
  importLogLabel: translate(
    'auto.components.sites.SiteSetupContinuation.importLogLabel',
    'Import log'
  ),
  importSteps: translate(
    'auto.components.sites.SiteSetupContinuation.importSteps',
    '{{count}} steps enabled'
  ),
  // Steps are off by default, exactly as in ocsites: pulling a live database or live files is
  // destructive, so nothing runs until it is asked for. What was missing is a way to ask from here.
  importChooseSteps: translate(
    'auto.components.sites.SiteSetupContinuation.importChooseSteps',
    'Choose steps'
  ),
  importStepsLegend: translate(
    'auto.components.sites.SiteSetupContinuation.importStepsLegend',
    'Import steps for {{environment}}'
  ),
  importNoSteps: translate(
    'auto.components.sites.SiteSetupContinuation.importNoSteps',
    'Nothing is enabled yet. Pick what to pull down — each one is off until you choose it.'
  ),
  importBranchWarning: translate(
    'auto.components.sites.SiteSetupContinuation.importBranchWarning',
    'The checked-out branch does not match an environment — confirm the target before importing.'
  ),
  overrideAction: translate(
    'auto.components.sites.SiteSetupContinuation.overrideAction',
    'Run anyway'
  ),
  skip: translate('auto.components.sites.SiteSetupContinuation.skip', 'Skip'),
  done: translate('auto.components.sites.SiteSetupContinuation.done', 'Done'),
  unavailable: translate('auto.components.sites.SiteSetupContinuation.unavailable', 'Not available')
}))
