// What each grantable setup action is called on the approval card and in Settings.

import type { SiteSetupAlwaysAllowableAction } from '../../../../shared/site-setup-always-allow'
import { translate } from '@/i18n/i18n'

export function siteSetupActionLabel(action: SiteSetupAlwaysAllowableAction): string {
  switch (action) {
    case 'create_project':
      return translate('auto.components.sites.setupActions.createProject', 'Creating projects')
    case 'update_project':
      return translate('auto.components.sites.setupActions.updateProject', 'Editing projects')
    case 'create_worktree':
      return translate('auto.components.sites.setupActions.createWorktree', 'Creating worktrees')
    case 'add_site_root':
      return translate('auto.components.sites.setupActions.addSiteRoot', 'Adding site folders')
    case 'register_site':
      return translate('auto.components.sites.setupActions.registerSite', 'Adding sites')
    case 'configure_site':
      return translate('auto.components.sites.setupActions.configureSite', 'Changing site settings')
    case 'import_site_config':
      return translate(
        'auto.components.sites.setupActions.importSiteConfig',
        'Importing site settings'
      )
    case 'set_up_local_site':
      return translate(
        'auto.components.sites.setupActions.setUpLocalSite',
        'Setting up local sites'
      )
  }
}
