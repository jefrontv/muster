// The dry run for putting a project under LocalWP: which of ocsites' two setups applies, every
// precondition, every file that will move, and every file that will be rewritten — without
// touching anything.
//
// ocsites has two distinct operations and Muster needs both:
//
//   create   ocsites `setup_localwp_before_clone` (tui_deploy:2740-2799) — the project has no
//            WordPress yet. Its only gates are "already registered" and "is Local running"; it
//            never looks for wp-config.php, because the database and wp-config arrive later with
//            the import.
//   migrate  ocsites `_migrate_to_localwp` (tui_deploy:2802+) — an existing WordPress install.
//            wp-config.php, the database export, and the wp-config rewrite belong only here.
//
// The mode is read off the project, not chosen by the user, so applying the migrate gate to a fresh
// checkout is not expressible.
//
// Because both setups are irreversible, this is the only place preconditions are evaluated;
// runLocalWpMigration re-plans and refuses whenever `ok` is false.

import path from 'node:path'
import { listRootEntriesToMove, type LocalWpFileOperations } from './localwp-app-public'
import { findLocalWpSiteId, isLocalWpAppRunning } from './localwp-detection'
import {
  isLocalWpSupported,
  LOCALWP_UNSUPPORTED_PLATFORM,
  localWpWordPressRoot,
  type LocalWpHost
} from './localwp-host'
import { readWpConfigDefine } from './wp-config-reader'
import type { LocalWpMigrationPlan, LocalWpSetupMode } from '../../shared/site-stack-types'

export type { LocalWpMigrationPlan, LocalWpSetupMode }

export const LOCALWP_ROOT = 'app/public'

/** ocsites' terminal line for the create path (tui_deploy:2630). */
export const LOCALWP_SITE_READY = 'LocalWP site ready.'

export type LocalWpMigrationRequest = {
  sitePath: string
  siteName: string
  /** e.g. acme.local */
  domain: string
  adminEmail: string
  adminPassword: string
  /** Proceed even though app/public already holds files that will be deleted. */
  force?: boolean
}

export async function planLocalWpMigration(
  request: LocalWpMigrationRequest,
  context: { host: LocalWpHost; fileOperations: LocalWpFileOperations }
): Promise<LocalWpMigrationPlan> {
  const { fileOperations } = context
  const appPublic = localWpWordPressRoot(request.sitePath)
  const rootConfigPath = path.join(request.sitePath, 'wp-config.php')
  const mode: LocalWpSetupMode = (await fileOperations.pathExists(rootConfigPath))
    ? 'migrate'
    : 'create'
  const plan: LocalWpMigrationPlan = {
    ok: false,
    blockedReason: '',
    mode,
    sitePath: request.sitePath,
    domain: request.domain,
    wordPressRoot: appPublic,
    databaseName: '',
    databaseUser: '',
    appPublicEntries: [],
    moves: [],
    edits: [],
    steps: []
  }
  const blocked = await findBlockingPrecondition(request, plan, context, appPublic)
  if (blocked) {
    return { ...plan, blockedReason: blocked }
  }
  if (mode === 'migrate') {
    const configContents = await readTextOrEmpty(fileOperations, rootConfigPath)
    plan.databaseName = readWpConfigDefine(configContents, 'DB_NAME') ?? ''
    plan.databaseUser = readWpConfigDefine(configContents, 'DB_USER') ?? 'root'
    plan.edits = [path.join(appPublic, 'wp-config.php')]
  }
  plan.moves = (await listRootEntriesToMove(request.sitePath, fileOperations)).map((entry) => ({
    from: path.join(request.sitePath, entry),
    to: path.join(appPublic, entry)
  }))
  plan.steps = buildPlanSteps(plan, request)
  plan.ok = true
  return plan
}

/** Returns the blocking reason, or an empty string when the setup may proceed. */
async function findBlockingPrecondition(
  request: LocalWpMigrationRequest,
  plan: LocalWpMigrationPlan,
  context: { host: LocalWpHost; fileOperations: LocalWpFileOperations },
  appPublic: string
): Promise<string> {
  const { host, fileOperations } = context
  if (!isLocalWpSupported(host)) {
    return LOCALWP_UNSUPPORTED_PLATFORM
  }
  // ocsites defaults this from the project folder name and refuses a blank one; the caller supplies
  // that default, so an empty value here means the user cleared it.
  if (request.domain.trim().length === 0) {
    return 'A LocalWP domain is required (e.g. acme.local).'
  }
  // ocsites' two bails, and the only two either setup shares: `_detect_localwp` (tui_deploy:2828)
  // and `site_already_registered` (:2757, :2835).
  if (await fileOperations.pathExists(path.join(appPublic, 'wp-config.php'))) {
    return 'This project is already a LocalWP site.'
  }
  if ((await findLocalWpSiteId(host, request.sitePath)) !== null) {
    return 'This project is already registered with LocalWP.'
  }
  if (!(await isLocalWpAppRunning(host))) {
    return 'The Local app is not running. Open Local and try again.'
  }
  // Destructive-step gate for both modes: whatever is already under app/public gets deleted, so it
  // is named in the plan and needs an explicit force.
  plan.appPublicEntries = await fileOperations.listDirectory(appPublic)
  if (plan.appPublicEntries.length > 0 && request.force !== true) {
    return `${appPublic} is not empty (${plan.appPublicEntries.length} entries). Re-run with force to delete its contents.`
  }
  return ''
}

function buildPlanSteps(plan: LocalWpMigrationPlan, request: LocalWpMigrationRequest): string[] {
  const register = `Register '${request.domain}' with the Local app at ${plan.sitePath}`
  const awaitSocket = 'Wait for the per-site MySQL socket to accept connections'
  const clear =
    plan.appPublicEntries.length > 0
      ? `Delete ${plan.appPublicEntries.length} existing entries under ${plan.wordPressRoot}`
      : `Clear Local's generated scaffold from ${plan.wordPressRoot}`
  const move = `Move ${plan.moves.length} project entries into ${plan.wordPressRoot}`
  if (plan.mode === 'create') {
    return [
      register,
      awaitSocket,
      clear,
      move,
      // ocsites' create path stops at the site; the database and wp-config.php come down with the
      // import, which is the next stage of the setup.
      'Leave the database and wp-config.php to the import step'
    ]
  }
  return [
    plan.databaseName
      ? `Export local database '${plan.databaseName}' as '${plan.databaseUser}' to a temporary gzipped dump`
      : 'Skip the database export — no DB_NAME in wp-config.php',
    register,
    awaitSocket,
    clear,
    'Restore git-tracked files under app/public',
    move,
    `Rewrite DB_HOST to 'localhost' and de-duplicate defines in ${plan.edits[0]}`,
    plan.databaseName
      ? `Import the dump into LocalWP's MySQL database '${plan.databaseName}'`
      : 'Skip the database import'
  ]
}

export async function readTextOrEmpty(
  fileOperations: LocalWpFileOperations,
  filePath: string
): Promise<string> {
  try {
    return await fileOperations.readTextFile(filePath)
  } catch {
    return ''
  }
}
