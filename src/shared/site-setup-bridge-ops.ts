// The setup lookups and approved writes an agent can ask the GUI for over the site write bridge.

export const SITE_SETUP_READ_OPS = [
  'projects',
  'clone-sources',
  'site-folders',
  'setup-plan',
  'local-stack',
  'setup-job',
  'ocsites-preview',
  'agent-setup'
] as const

export type SiteSetupReadOp = (typeof SITE_SETUP_READ_OPS)[number]

export const SITE_SETUP_WRITE_OPS = [
  'create-project',
  'register-site',
  'add-site-root',
  'remove-project',
  'create-worktree',
  'update-project',
  'set-up-local-site',
  'import-ocsites',
  'stage-bind-link',
  'open-agent-setup'
] as const

export type SiteSetupWriteOp = (typeof SITE_SETUP_WRITE_OPS)[number]

export function isSiteSetupWriteOp(value: unknown): value is SiteSetupWriteOp {
  return typeof value === 'string' && (SITE_SETUP_WRITE_OPS as readonly string[]).includes(value)
}

export function isSiteSetupReadOp(value: unknown): value is SiteSetupReadOp {
  return typeof value === 'string' && (SITE_SETUP_READ_OPS as readonly string[]).includes(value)
}
