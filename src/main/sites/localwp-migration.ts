// Executing both of ocsites' LocalWP setups: create the Local site, relocate the project into
// app/public, and — for an existing WordPress install only — point wp-config.php at Local's MySQL
// and import the database.
//
// `create` is ocsites `setup_localwp_before_clone` (tui_deploy:2740-2799) via `_run_localwp_log_tui`
// with pre_clone=True (:2619-2630); `migrate` is the standard-WordPress branch of the
// migrate-to-LocalWP worker (:2813-3145). Bedrock's separate relocate path is deliberately out of
// scope here.
//
// Ordering note for `create`: ocsites empties app/public and then clones into it, because it runs
// before the clone. Muster's bind flow has already cloned to the project root by the time this
// stage is reachable, so this reaches the same end state the way ocsites' own migrate worker does
// (:3072-3083) — create the site at the project root, then move the existing entries in. End state
// is identical: a registered site, a live socket, and the project under app/public.
//
// Destructive and irreversible: preconditions and the dry run live in localwp-migration-plan.ts, and
// this refuses to touch anything unless that plan says ok.

import path from 'node:path'
import {
  createLocalWpFileOperations,
  emptyAppPublic,
  moveRootEntriesIntoAppPublic,
  restoreGitAppPublic,
  rewriteLocalDbHost,
  type LocalWpFileOperations
} from './localwp-app-public'
import { discardLocalDatabaseExport, exportLocalDatabase } from './localwp-database-export'
import { createLocalWpHost, localWpWordPressRoot, type LocalWpHost } from './localwp-host'
import {
  LOCALWP_ROOT,
  LOCALWP_SITE_READY,
  planLocalWpMigration,
  readTextOrEmpty,
  type LocalWpMigrationPlan,
  type LocalWpMigrationRequest,
  type LocalWpSetupMode
} from './localwp-migration-plan'
import { addLocalWpSite } from './localwp-site-creation'
import { waitForSocket } from './localwp-site-control'
import { readWpConfigDefine, sanitizeWpConfig } from './wp-config-reader'
import type { LocalWpMigrationResult } from '../../shared/site-stack-types'

export type { LocalWpMigrationResult }

/** The database import is owned by the DB layer; the caller injects it so nothing is duplicated. */
export type LocalWpMigrationDependencies = {
  importDatabase: (options: {
    dumpPath: string
    databaseName: string
    socketPath: string
  }) => Promise<void>
  host?: LocalWpHost
  fileOperations?: LocalWpFileOperations
  onStatus?: (message: string) => void
  signal?: AbortSignal
  createSite?: typeof addLocalWpSite
  exportDatabase?: typeof exportLocalDatabase
  awaitSocket?: typeof waitForSocket
}

/** The dry run: preconditions plus the exact set of moves and rewrites, mutating nothing. */
export async function previewLocalWpMigration(
  request: LocalWpMigrationRequest,
  dependencies: Partial<Pick<LocalWpMigrationDependencies, 'host' | 'fileOperations'>> = {}
): Promise<LocalWpMigrationPlan> {
  return planLocalWpMigration(request, {
    host: dependencies.host ?? createLocalWpHost(),
    fileOperations: dependencies.fileOperations ?? createLocalWpFileOperations()
  })
}

export async function runLocalWpMigration(
  request: LocalWpMigrationRequest,
  dependencies: LocalWpMigrationDependencies
): Promise<LocalWpMigrationResult> {
  const host = dependencies.host ?? createLocalWpHost()
  const fileOperations = dependencies.fileOperations ?? createLocalWpFileOperations()
  const log: string[] = []
  const record = (message: string): void => {
    log.push(message)
    dependencies.onStatus?.(message)
  }
  const plan = await planLocalWpMigration(request, { host, fileOperations })
  if (!plan.ok) {
    return failed(plan, plan.blockedReason, log)
  }
  // Export first: it is the only step that reads the pre-migration database, and it must not run
  // after Local has repointed the site at its own MySQL. `create` has no database to read — the
  // import stage is what brings one down.
  const dump = plan.databaseName
    ? await exportDump(request, plan, dependencies, fileOperations, record)
    : null
  try {
    const created = await (dependencies.createSite ?? addLocalWpSite)(
      {
        domain: request.domain,
        name: request.siteName,
        sitePath: request.sitePath,
        adminEmail: request.adminEmail,
        adminPassword: request.adminPassword
      },
      { host, onStatus: record, signal: dependencies.signal }
    )
    if (!created.ok) {
      return failed(plan, `LocalWP site creation failed: ${created.message}`, log)
    }
    // ocsites' exact sequence (tui_deploy:2608-2617): announce the wait, then fail with a timeout
    // that names the budget and the likeliest cause, because Local silently does nothing when the
    // app is closed or its OS password prompt is still unanswered.
    record('Waiting for LocalWP to complete setup…')
    const socketPath = await (dependencies.awaitSocket ?? waitForSocket)(request.sitePath, {
      host,
      onStatus: record,
      signal: dependencies.signal
    })
    if (!socketPath) {
      return failed(
        plan,
        'Timed out waiting for the LocalWP MySQL socket (3 min). Is the Local app open?',
        log
      )
    }
    record('Socket ready.')
    const relocateError = await relocateProject(request, host, fileOperations, record, plan.mode)
    if (relocateError) {
      return failed(plan, relocateError, log)
    }
    if (plan.mode === 'create') {
      // ocsites' create path ends here (tui_deploy:2630). There is no wp-config.php to rewrite and
      // no dump to import; both arrive with "Import from the server".
      record(LOCALWP_SITE_READY)
      return {
        ok: true,
        plan,
        socketPath,
        localWpRoot: LOCALWP_ROOT,
        databaseImported: false,
        log,
        message: LOCALWP_SITE_READY
      }
    }
    await applyLocalWpConfigEdits(plan, fileOperations, record)
    const databaseImported = await importDump(
      plan,
      dump?.dumpPath ?? '',
      socketPath,
      dependencies,
      record
    )
    return {
      ok: true,
      plan,
      socketPath,
      localWpRoot: LOCALWP_ROOT,
      databaseImported,
      log,
      message: databaseImported
        ? 'Migration complete.'
        : 'Migration complete — set the database up manually.'
    }
  } finally {
    if (dump) {
      await discardLocalDatabaseExport(dump.workDirectory)
    }
  }
}

async function exportDump(
  request: LocalWpMigrationRequest,
  plan: LocalWpMigrationPlan,
  dependencies: LocalWpMigrationDependencies,
  fileOperations: LocalWpFileOperations,
  record: (message: string) => void
): Promise<{ dumpPath: string; workDirectory: string } | null> {
  const configContents = await readTextOrEmpty(
    fileOperations,
    path.join(request.sitePath, 'wp-config.php')
  )
  const result = await (dependencies.exportDatabase ?? exportLocalDatabase)({
    databaseName: plan.databaseName,
    databaseUser: plan.databaseUser,
    databasePassword: readWpConfigDefine(configContents, 'DB_PASSWORD') ?? 'root',
    onStatus: record,
    signal: dependencies.signal
  })
  if (result.ok) {
    record('Local database exported.')
    return { dumpPath: result.dumpPath, workDirectory: result.workDirectory }
  }
  // A missing or unreachable database must not abort the migration: the files still move and the
  // site is still created, exactly as ocsites behaves.
  record(`Continuing without a database import — ${result.reason}`)
  return null
}

/** Returns an error message, or an empty string on success. */
async function relocateProject(
  request: LocalWpMigrationRequest,
  host: LocalWpHost,
  fileOperations: LocalWpFileOperations,
  record: (message: string) => void,
  mode: LocalWpSetupMode
): Promise<string> {
  // Local scaffolds app/public while creating the site; clear it so the project's own wp-content
  // replaces the scaffold rather than nesting inside it. ocsites clears here too, one step after the
  // socket is ready (tui_deploy:2620).
  if (await fileOperations.pathExists(localWpWordPressRoot(request.sitePath))) {
    record("Clearing Local's generated app/public scaffold…")
    const cleared = await emptyAppPublic(request.sitePath, fileOperations)
    if (!cleared.ok) {
      return `Failed to clear app/public: ${cleared.message}`
    }
  }
  // Migrate-only, as in ocsites: an existing install has git-tracked files under app/public that
  // Local's scaffold may have clobbered. In `create` mode app/public was never tracked, so
  // `git restore app/public` has nothing to recover and ocsites skips it (tui_deploy:2619).
  if (mode === 'migrate') {
    const restored = await restoreGitAppPublic(request.sitePath, host)
    if (restored.message) {
      record(restored.message)
    }
  }
  record('Moving project files into app/public…')
  const moved = await moveRootEntriesIntoAppPublic(request.sitePath, fileOperations, record)
  return moved.ok ? '' : moved.message
}

/**
 * Runs BEFORE the database import. The import is the most failure-prone step, and doing the config
 * edits first means a failed import cannot leave the project half-migrated and unrecognised as
 * LocalWP — the user can simply re-run the import.
 */
async function applyLocalWpConfigEdits(
  plan: LocalWpMigrationPlan,
  fileOperations: LocalWpFileOperations,
  record: (message: string) => void
): Promise<void> {
  const configPath = plan.edits[0] ?? ''
  if (await rewriteLocalDbHost(configPath, fileOperations)) {
    record('Updated DB_HOST in wp-config.php.')
  }
  // A constant defined twice emits a PHP warning that later aborts WP-CLI.
  const sanitized = sanitizeWpConfig(await readTextOrEmpty(fileOperations, configPath))
  if (sanitized.deduplicated.length > 0) {
    await fileOperations.writeTextFile(configPath, sanitized.contents)
    record(`Sanitized wp-config: de-duplicated ${sanitized.deduplicated.join(', ')}.`)
  }
}

async function importDump(
  plan: LocalWpMigrationPlan,
  dumpPath: string,
  socketPath: string,
  dependencies: LocalWpMigrationDependencies,
  record: (message: string) => void
): Promise<boolean> {
  if (!dumpPath || !plan.databaseName) {
    record(
      "The database was not imported. Set it up manually in Local, or re-run the site's import."
    )
    return false
  }
  record(`Importing the database into LocalWP's MySQL database '${plan.databaseName}'…`)
  try {
    await dependencies.importDatabase({ dumpPath, databaseName: plan.databaseName, socketPath })
    record('Database imported.')
    return true
  } catch (error) {
    record(
      `Database import failed (${error instanceof Error ? error.message : String(error)}). The site is migrated — import the database manually.`
    )
    return false
  }
}

function failed(
  plan: LocalWpMigrationPlan,
  message: string,
  log: string[]
): LocalWpMigrationResult {
  return {
    ok: false,
    message,
    plan,
    socketPath: '',
    localWpRoot: '',
    databaseImported: false,
    log: [...log, message]
  }
}
