// WordPress site management (the ocsites port). A Site is deploy/import metadata attached to an
// existing Repo — the repo stays the identity spine, the site adds a control surface.
//
// Secrets are deliberately absent from these types: SSH and DB passwords live in per-secret
// safeStorage files (src/main/sites/site-secret-store.ts) and only ever cross IPC as boolean
// "is set" flags, matching ocsites' MCP posture where passwords are never returned.

/**
 * Import steps pull the server down to local, in pipeline execution order.
 * Upload-rewrite runs before search-replace: the rewrite edits .htaccess (and strips the
 * production redirects that would 301 localhost back to live), and search-replace must run
 * against the already-corrected local domain. See ocsites backup.py run() :446-536.
 */
export const SITE_IMPORT_TOGGLES = [
  { key: 'exportDatabase', label: 'Pull/import server DB' },
  { key: 'exportFiles', label: 'Pull server files' },
  { key: 'wpUploadRewrite', label: 'WP upload rewrite' },
  { key: 'wpSearchReplace', label: 'WP search replace' }
] as const

/** Deploy steps push local up to the server. */
export const SITE_DEPLOY_TOGGLES = [
  { key: 'gitPullOnServer', label: 'Git pull on server' },
  { key: 'clearServerCache', label: 'Clear server cache' },
  { key: 'deployThemes', label: 'Deploy theme dist' }
] as const

export type SiteImportToggleKey = (typeof SITE_IMPORT_TOGGLES)[number]['key']
export type SiteDeployToggleKey = (typeof SITE_DEPLOY_TOGGLES)[number]['key']
export type SiteToggleKey = SiteImportToggleKey | SiteDeployToggleKey

export type SiteRunGroup = 'import' | 'deploy'

export type SiteLocalStack = 'plain' | 'mamp' | 'localwp' | 'agent-local'

/** Every stack a site can be set to, for validation and pickers. */
export const SITE_LOCAL_STACKS: readonly SiteLocalStack[] = [
  'plain',
  'mamp',
  'localwp',
  'agent-local'
]

export const DEFAULT_SITE_ENVIRONMENT_NAME = 'main'
export const DEFAULT_SITE_REMOTE_ROOT_PATH = 'public_html'
export const DEFAULT_SITE_SSH_PORT = 22

/** Parses a stored `sshPort` string; anything unusable falls back to the SSH default. */
export function resolveSiteSshPort(sshPort: string | undefined): number {
  const parsed = Number.parseInt((sshPort ?? '').trim(), 10)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_SITE_SSH_PORT
}

/** One remote target (production, staging, …). Toggles are per-environment, as in ocsites. */
export type SiteEnvironment = {
  hostname: string
  /** Empty means the SSH default; kept as text so the field round-trips what the user typed. */
  sshPort: string
  username: string
  /** Remote WordPress root, relative to the SSH user's home. */
  rootPath: string
  liveDomain: string
  liveDomainProtocol: 'http' | 'https'
  /** Theme build command; empty falls back to the pipeline default. */
  deployCommand: string
  /** Overrides the default `wp-content/themes/<theme>/assets/dist`; `<theme>` is substituted. */
  themeDistPath: string
  exportDatabase: boolean
  exportFiles: boolean
  wpSearchReplace: boolean
  wpUploadRewrite: boolean
  gitPullOnServer: boolean
  clearServerCache: boolean
  deployThemes: boolean
}

export type Site = {
  id: string
  /**
   * The local checkout directory. This is the site's real identity — ocsites keys presets on
   * `local_target_directory`, and a site exists on disk whether or not it has been opened in
   * Muster yet. Compare with normalizeRuntimePathForComparison, never with ===.
   */
  path: string
  /**
   * FK to Repo.id once the checkout has been added as a repo. Null for an imported site the user
   * has not opened yet — importing 201 presets must not add 201 repos to the sidebar.
   */
  repoId: string | null
  displayName: string
  /** Subpath inside `path` where WordPress actually lives; 'app/public' under LocalWP. */
  localWpRoot: string
  /** e.g. acme.local */
  localDomain: string
  localStack: SiteLocalStack
  dbUser: string
  /** Unix socket for a LocalWP per-site daemon; empty means 127.0.0.1 TCP. */
  dbSocket: string
  dbPort: number | null
  phpVersion: string
  activeEnvironment: string
  environments: Record<string, SiteEnvironment>
  notes: string
  /** Seconds; 0 disables the wp search-replace timeout. */
  searchReplaceTimeoutSeconds: number
}

/** Which secrets exist for an environment. The values never cross IPC. */
export type SiteSecretPresence = {
  ssh: boolean
  db: boolean
}

export type SiteSecretKind = 'ssh' | 'db'

/** A site as the renderer sees it: config plus derived, non-secret status. */
export type SiteSummary = {
  site: Site
  /** False when the checkout is gone (external drive unmounted, folder deleted). */
  pathExists: boolean
  branch: string | null
  /** Environment the current branch resolves to, and why — the accidental-prod-deploy guard. */
  resolvedEnvironment: SiteEnvironmentResolution
  /** Keyed by environment name. */
  secrets: Record<string, SiteSecretPresence>
  importSelectedCount: number
  deploySelectedCount: number
}

export type SiteEnvironmentResolutionReason =
  | 'branch-match'
  | 'active-environment'
  | 'default-main'
  | 'first-environment'
  | 'no-environments'

export type SiteEnvironmentResolution = {
  environment: string | null
  reason: SiteEnvironmentResolutionReason
  /** True when the branch matched nothing — a write action must be blocked or confirmed. */
  requiresConfirmation: boolean
}

/**
 * Every sites IPC handler returns this instead of throwing — an exception across the bridge
 * loses its type and its stack, so the renderer branches on the tag.
 */
export type SiteResult<T> = { ok: true; value: T } | { ok: false; error: string }

export type SiteSecretFailure = {
  path: string
  environment: string
  kind: string
  reason: string
}

/** Outcome of binding sites to sidebar projects. */
export type SiteRepoLinkResult = {
  eligible: number
  added: number
  linked: number
  skipped: { path: string; reason: string }[]
}

/**
 * Outcome of putting everything on disk into the sidebar: candidates discovered under the
 * configured roots become sites (`adopted`), then every site links to a project.
 *
 * `adopted` is separate from `added` because they answer different questions — how many folders
 * Muster had never seen before, versus how many sidebar projects appeared.
 */
export type SiteSidebarSyncResult = SiteRepoLinkResult & { adopted: number }

/** Outcome of importing the legacy ~/.config/ocsites configuration. */
export type OcsitesImportApplyResult = {
  created: number
  updated: number
  /** Sites whose checkout directory no longer exists; imported anyway so config is not lost. */
  missingPaths: string[]
  secretsStored: number
  secretsFailed: SiteSecretFailure[]
  /** True when the OS keychain is unavailable — every secret write failed for the same reason. */
  secretStorageUnavailable: boolean
}

export function createEmptySiteEnvironment(): SiteEnvironment {
  return {
    hostname: '',
    sshPort: '',
    username: '',
    rootPath: DEFAULT_SITE_REMOTE_ROOT_PATH,
    liveDomain: '',
    liveDomainProtocol: 'https',
    deployCommand: '',
    themeDistPath: '',
    exportDatabase: false,
    exportFiles: false,
    wpSearchReplace: false,
    wpUploadRewrite: false,
    gitPullOnServer: false,
    clearServerCache: false,
    deployThemes: false
  }
}

export function countSelectedToggles(environment: SiteEnvironment, group: SiteRunGroup): number {
  const toggles = group === 'import' ? SITE_IMPORT_TOGGLES : SITE_DEPLOY_TOGGLES
  return toggles.reduce((total, toggle) => (environment[toggle.key] ? total + 1 : total), 0)
}

/**
 * ocsites' branch → environment rule: exact branch-name match wins, then the environment the site
 * is actually pointed at, then a 'main' environment, then the first one. Anything but a branch match
 * requires confirmation before a write action, so an unmatched branch can never silently deploy to
 * production.
 *
 * Why activeEnvironment outranks 'main': a bind link names its target environment and stores it
 * here. Preferring a stale 'main' over it showed the wrong environment's fields — so edits landed
 * in 'main' while runs used something else.
 */
export function resolveSiteEnvironment(
  site: Pick<Site, 'environments' | 'activeEnvironment'>,
  branch: string | null
): SiteEnvironmentResolution {
  const names = Object.keys(site.environments)
  if (names.length === 0) {
    return { environment: null, reason: 'no-environments', requiresConfirmation: true }
  }
  if (branch && names.includes(branch)) {
    return { environment: branch, reason: 'branch-match', requiresConfirmation: false }
  }
  if (site.activeEnvironment && names.includes(site.activeEnvironment)) {
    return {
      environment: site.activeEnvironment,
      reason: 'active-environment',
      requiresConfirmation: true
    }
  }
  if (names.includes(DEFAULT_SITE_ENVIRONMENT_NAME)) {
    return {
      environment: DEFAULT_SITE_ENVIRONMENT_NAME,
      reason: 'default-main',
      requiresConfirmation: true
    }
  }
  return { environment: names[0] ?? null, reason: 'first-environment', requiresConfirmation: true }
}
