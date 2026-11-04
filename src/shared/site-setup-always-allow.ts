// Setup actions a person can approve for good, so later requests for them skip the approval card.
//
// A grant is per action, for every site and every agent: the agent name on a card is self-reported,
// so it cannot scope a grant. A password and a project removal always ask.

export const SITE_SETUP_ALWAYS_ALLOWABLE_ACTIONS = [
  'create_project',
  'update_project',
  'create_worktree',
  'add_site_root',
  'register_site',
  'configure_site',
  'import_site_config',
  'set_up_local_site'
] as const

export type SiteSetupAlwaysAllowableAction = (typeof SITE_SETUP_ALWAYS_ALLOWABLE_ACTIONS)[number]

export function isAlwaysAllowableSetupAction(
  action: unknown
): action is SiteSetupAlwaysAllowableAction {
  return (
    typeof action === 'string' &&
    (SITE_SETUP_ALWAYS_ALLOWABLE_ACTIONS as readonly string[]).includes(action)
  )
}

/** Eligible, unique action names in a stable order; anything else (stale or hand-edited) drops. */
export function normalizeSiteSetupAlwaysAllow(value: unknown): SiteSetupAlwaysAllowableAction[] {
  if (!Array.isArray(value)) {
    return []
  }
  return SITE_SETUP_ALWAYS_ALLOWABLE_ACTIONS.filter((action) => value.includes(action))
}
