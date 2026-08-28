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

/**
 * A user-authored step, created by hand or by an agent through the muster-sites MCP.
 *
 * Why these are records and not more entries in the toggle tuples above: those keys are literal
 * boolean properties on SiteEnvironment, destructured by name in both pipelines. A user-defined
 * step cannot be a compile-time key, so it is data — a named command the generic runner executes.
 *
 * Scope is the SITE, not the environment: definitions and their enabled state travel together, so
 * a step survives environment add/rename and copies to another site as one unit.
 */
export type SiteCustomStep = {
  id: string
  name: string
  description?: string
  group: SiteRunGroup
  /** Remote runs over the run's SSH session; local runs in the site checkout. */
  runsOn: 'remote' | 'local'
  /**
   * Shell string, run verbatim after placeholder substitution. Empty when the step runs a script
   * file instead; exactly one of `command` and `scriptPath` carries the work.
   */
  command: string
  /**
   * Repo-relative path to a bash script inside the site checkout, e.g. `.muster/steps/purge.sh`.
   *
   * A file rather than an inline body because complex steps want version control, a real editor,
   * and `bash .muster/steps/purge.sh` outside Muster. The script is transferred as data and never
   * parsed by an intermediate shell, which is what removes the SSH quoting hazard a long one-liner
   * has. Values arrive as MUSTER_* environment variables, never substituted into the script text.
   */
  scriptPath?: string
  /**
   * The script's contents, captured when a step is promoted to the library.
   *
   * A library entry cannot point at a file in someone else's checkout, so promoting embeds the
   * script and installing writes it back out. Absent on ordinary site steps, which read the file.
   */
  scriptContents?: string
  /**
   * Where it sits relative to the built-in steps of the same group. `before` is what makes the
   * maintenance-mode pattern work: enable before the deploy, disable after it.
   */
  position: SiteCustomStepPosition
  /** Sort order within (group, position). */
  order: number
  enabled: boolean
  /** Where this step came from, retained across copy and library install. */
  origin?: SiteCustomStepOrigin
}

export type SiteCustomStepPosition = 'before' | 'after'

export type SiteCustomStepOrigin =
  | { kind: 'copied'; fromSiteId: string }
  | { kind: 'library'; libraryId: string }

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
  /** User-authored steps. Absent on sites saved before the feature existed. */
  customSteps?: SiteCustomStep[]
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
 * One Bitbucket Pipelines run for a site's repository.
 *
 * Read from the Pipelines API rather than commit build statuses: Pipelines does not write commit
 * statuses (that endpoint is for external CI posting in), so a status-based view is empty even for
 * repos that clearly ran a pipeline on the exact commit.
 */
export type SitePipelineRun = {
  buildNumber: number
  /**
   * Bitbucket reports "is it finished" and "how did it end" separately; this is the pair already
   * collapsed, because only the combination means anything to a reader.
   */
  status: 'running' | 'pending' | 'paused' | 'success' | 'failure' | 'stopped' | 'unknown'
  refName: string | null
  commitSha: string | null
  /** What started it — PUSH, PULLREQUEST, SCHEDULE, MANUAL. */
  trigger: string | null
  createdOn: number | null
  durationSeconds: number | null
  /**
   * Which step the pipeline is on, and how far through. Populated only for the newest run while it
   * is still in flight — resolving it costs a second API call, and it is a meaningless question
   * about a pipeline that finished days ago.
   */
  currentStep: string | null
  completedSteps: number | null
  totalSteps: number | null
  /** The page a person wants, not the API resource. */
  url: string
}

/**
 * Why a site has no pipelines to show. `forbidden` and `not-found` are real rather than
 * theoretical: the shipped OAuth consumer holds the `pipeline` scope but a self-built Muster may
 * point at one that does not, and sites whose Bitbucket repo was renamed keep a stale remote URL.
 * Both must degrade quietly instead of erroring every poll.
 */
export type SitePipelinesUnavailable =
  | 'not-bitbucket'
  | 'not-authenticated'
  | 'forbidden'
  | 'not-found'

export type SitePipelinesResult =
  | { available: true; runs: SitePipelineRun[]; workspace: string; repoSlug: string }
  | { available: false; reason: SitePipelinesUnavailable }

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
 * Placeholders a custom step's command may reference. One list so the editor's hints and the
 * runtime substitution cannot drift — main resolves values for exactly these keys.
 *
 * No secrets, deliberately: a command that needs a credential must fetch it itself, so a step
 * definition can never carry one and nothing sensitive reaches the run log through substitution.
 */
export const CUSTOM_STEP_PLACEHOLDERS = [
  { name: 'sitePath', description: 'Local checkout directory' },
  { name: 'wpDir', description: 'WordPress root (checkout + local WP subpath)' },
  { name: 'remoteRoot', description: 'Remote WordPress root for the environment' },
  { name: 'liveDomain', description: "The environment's live domain" },
  { name: 'localDomain', description: "The site's local domain" },
  { name: 'environment', description: 'Resolved environment name' }
] as const

export type CustomStepPlaceholderName = (typeof CUSTOM_STEP_PLACEHOLDERS)[number]['name']

/**
 * The environment variable a placeholder arrives as inside a script: `wpDir` -> `MUSTER_WP_DIR`.
 *
 * Scripts get values this way instead of `{{placeholder}}` substitution. Splicing text into code
 * breaks on any script that legitimately contains braces (jq, awk, mustache templates) and puts
 * the quoting burden in the wrong place — an env var is just a value the script reads.
 */
export function customStepEnvName(placeholder: CustomStepPlaceholderName): string {
  return `MUSTER_${placeholder.replaceAll(/(?<=[a-z])(?=[A-Z])/g, '_').toUpperCase()}`
}

/**
 * Where step scripts live by convention, relative to the checkout.
 *
 * Named once so the MCP tool descriptions, the editor placeholder and the "create the file here"
 * hint cannot drift apart — an agent told one directory and shown another would write the script
 * somewhere the runner never looks.
 */
export const CUSTOM_STEP_SCRIPT_DIR = '.muster/steps'

/** Longest a script path may be, matching the other bounded string fields on a site. */
export const CUSTOM_STEP_SCRIPT_PATH_MAX = 512

/**
 * Whether a script path is safe to resolve against a checkout.
 *
 * The path is operator-supplied but reaches a shell, so it must stay inside the site: no absolute
 * paths, no `..` traversal, no backslashes (a Windows-style separator would survive a POSIX
 * `..` check and still escape), and no leading `~`. Callers still resolve and re-check the result.
 */
export function isSafeCustomStepScriptPath(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > CUSTOM_STEP_SCRIPT_PATH_MAX) {
    return false
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('~') || trimmed.includes('\\')) {
    return false
  }
  // Drive letters would be absolute on Windows even without a leading separator.
  if (/^[A-Za-z]:/.test(trimmed)) {
    return false
  }
  return trimmed.split('/').every((segment) => segment !== '..' && segment !== '')
}

/** The work a step performs. Exactly one of the two fields is populated. */
export type CustomStepSource =
  | { kind: 'command'; command: string }
  | { kind: 'script'; scriptPath: string }

/**
 * Narrows a step to what it actually runs, so every read site branches instead of guessing which
 * field won. A script path always wins when present; `command` is what older records carry.
 */
export function customStepSource(
  step: Pick<SiteCustomStep, 'command' | 'scriptPath'>
): CustomStepSource | null {
  if (step.scriptPath && step.scriptPath.trim().length > 0) {
    return { kind: 'script', scriptPath: step.scriptPath.trim() }
  }
  if (step.command.trim().length > 0) {
    return { kind: 'command', command: step.command }
  }
  return null
}

/**
 * Moves a step within its own (group, position) lane and renumbers that lane.
 *
 * Why lane-scoped: `order` only ever sorts against siblings that run in the same slot, so moving a
 * deploy/after step past an import step would be meaningless. Returns the full array so the caller
 * can persist it as one write.
 */
export function moveCustomStep(
  steps: readonly SiteCustomStep[],
  stepId: string,
  delta: -1 | 1
): SiteCustomStep[] {
  const target = steps.find((step) => step.id === stepId)
  if (!target) {
    return [...steps]
  }
  const lane = steps
    .filter((step) => step.group === target.group && step.position === target.position)
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
  const from = lane.findIndex((step) => step.id === stepId)
  const to = from + delta
  if (to < 0 || to >= lane.length) {
    return [...steps]
  }
  const reordered = [...lane]
  const [moved] = reordered.splice(from, 1)
  reordered.splice(to, 0, moved)
  const orderById = new Map(reordered.map((step, index) => [step.id, index]))
  return steps.map((step) =>
    orderById.has(step.id) ? { ...step, order: orderById.get(step.id)! } : step
  )
}

/**
 * Enabled custom steps for one group, in the order they run: `before` steps first, then `after`,
 * each sorted by `order` and tie-broken by name so the sequence is stable across saves.
 */
export function selectCustomSteps(
  site: Pick<Site, 'customSteps'>,
  group: SiteRunGroup,
  position?: SiteCustomStepPosition
): SiteCustomStep[] {
  const steps = (site.customSteps ?? []).filter(
    (step) =>
      step.enabled && step.group === group && (position === undefined || step.position === position)
  )
  const positionRank = (step: SiteCustomStep): number => (step.position === 'before' ? 0 : 1)
  return steps.sort(
    (left, right) =>
      positionRank(left) - positionRank(right) ||
      left.order - right.order ||
      left.name.localeCompare(right.name)
  )
}

/**
 * Total steps a run would execute for a group. Custom steps count: a run with built-ins all off but
 * a custom step ticked is a real run, not `no-steps-selected`.
 */
export function countSelectedSteps(
  site: Pick<Site, 'customSteps'>,
  environment: SiteEnvironment,
  group: SiteRunGroup
): number {
  return countSelectedToggles(environment, group) + selectCustomSteps(site, group).length
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
