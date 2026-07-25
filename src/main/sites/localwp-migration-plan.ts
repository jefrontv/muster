// The dry run for migrating a plain WordPress checkout into LocalWP: every precondition, every file
// that will move, and every file that will be rewritten — without touching anything.
//
// Because the migration itself is irreversible, this is the only place preconditions are evaluated;
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
import type { LocalWpMigrationPlan } from '../../shared/site-stack-types'

export type { LocalWpMigrationPlan }

export const LOCALWP_ROOT = 'app/public'

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
  const plan: LocalWpMigrationPlan = {
    ok: false,
    blockedReason: '',
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
  const configContents = await readTextOrEmpty(
    fileOperations,
    path.join(request.sitePath, 'wp-config.php')
  )
  plan.databaseName = readWpConfigDefine(configContents, 'DB_NAME') ?? ''
  plan.databaseUser = readWpConfigDefine(configContents, 'DB_USER') ?? 'root'
  plan.moves = (await listRootEntriesToMove(request.sitePath, fileOperations)).map((entry) => ({
    from: path.join(request.sitePath, entry),
    to: path.join(appPublic, entry)
  }))
  plan.edits = [path.join(appPublic, 'wp-config.php')]
  plan.steps = buildPlanSteps(plan, request)
  plan.ok = true
  return plan
}

/** Returns the blocking reason, or an empty string when the migration may proceed. */
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
  if (request.domain.trim().length === 0) {
    return 'A LocalWP domain is required (e.g. acme.local).'
  }
  if (await fileOperations.pathExists(path.join(appPublic, 'wp-config.php'))) {
    return 'This project is already a LocalWP site.'
  }
  if ((await findLocalWpSiteId(host, request.sitePath)) !== null) {
    return 'This project is already registered with LocalWP.'
  }
  if (!(await isLocalWpAppRunning(host))) {
    return 'The Local app is not running. Open Local and try again.'
  }
  const rootConfigPath = path.join(request.sitePath, 'wp-config.php')
  if (!(await fileOperations.pathExists(rootConfigPath))) {
    return `wp-config.php not found at ${rootConfigPath}. Migration requires a WordPress install at the project root.`
  }
  plan.appPublicEntries = await fileOperations.listDirectory(appPublic)
  if (plan.appPublicEntries.length > 0 && request.force !== true) {
    return `${appPublic} is not empty (${plan.appPublicEntries.length} entries). Re-run with force to delete its contents.`
  }
  return ''
}

function buildPlanSteps(plan: LocalWpMigrationPlan, request: LocalWpMigrationRequest): string[] {
  return [
    plan.databaseName
      ? `Export local database '${plan.databaseName}' as '${plan.databaseUser}' to a temporary gzipped dump`
      : 'Skip the database export — no DB_NAME in wp-config.php',
    `Register '${request.domain}' with the Local app at ${plan.sitePath}`,
    'Wait for the per-site MySQL socket to accept connections',
    `Delete ${plan.appPublicEntries.length} existing entries under ${plan.wordPressRoot}`,
    'Restore git-tracked files under app/public',
    `Move ${plan.moves.length} project entries into ${plan.wordPressRoot}`,
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
