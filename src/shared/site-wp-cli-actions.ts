// The WP-CLI quick actions the Site panel offers. A closed list, not free text: the IPC surface
// accepts an action id and resolves the command here, so the renderer can never send an arbitrary
// shell string across the bridge. Agents wanting arbitrary commands have run_ssh_command instead.

export type SiteWpCliActionId = 'core-version' | 'plugin-list' | 'cache-flush'

export type SiteWpCliAction = {
  id: SiteWpCliActionId
  label: string
  /** Runs from the environment's remote root, where wp-cli expects to find the installation. */
  command: string
  /** Write actions get a confirmation prompt; read actions run immediately. */
  writes: boolean
}

export const SITE_WP_CLI_ACTIONS: readonly SiteWpCliAction[] = [
  {
    id: 'core-version',
    label: 'WP version',
    command: 'wp core version --extra',
    writes: false
  },
  {
    id: 'plugin-list',
    label: 'Active plugins',
    command: 'wp plugin list --status=active --fields=name,version,update',
    writes: false
  },
  {
    id: 'cache-flush',
    label: 'Flush cache',
    command: 'wp cache flush',
    writes: true
  }
]

export function getSiteWpCliAction(id: string): SiteWpCliAction | null {
  return SITE_WP_CLI_ACTIONS.find((action) => action.id === id) ?? null
}

export type SiteWpCliResult = {
  ok: boolean
  /** Refused by the run guard (unmatched branch, missing credential) rather than executed. */
  blocked?: boolean
  needsConfirmation?: boolean
  message?: string
  environment?: string
  /** `user@hostname` the command actually ran on, so the panel can say WHERE. */
  host?: string
  exitCode?: number
  output?: string
  truncated?: boolean
}
