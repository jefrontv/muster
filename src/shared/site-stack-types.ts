// Wire types for a site's local WordPress stack (LocalWP / MAMP).
//
// These live in shared/ rather than beside their implementations because the preload type surface
// is compiled into the browser project: importing them from a main module would drag node:fs into
// the renderer build. The main modules re-export these so there is still one definition.

import type { SiteLocalStack } from './site-types'

export type LocalWpStackDetection = {
  supported: boolean
  /** Non-empty only when detection could not run at all (wrong platform). */
  reason: string
  stack: SiteLocalStack
  appRunning: boolean
  registered: boolean
  siteId: string
  /** The domain the managing stack serves this site on ('' when unknown/unregistered). */
  domain: string
  /** The live socket, or empty when mysqld is not accepting connections. */
  socketPath: string
  socketReady: boolean
  phpVersion: string
}

export type LocalWpControlState =
  | 'running'
  | 'started'
  | 'stopped'
  | 'not-managed'
  | 'unsupported'
  | 'failed'

export type LocalWpControlOutcome = {
  ok: boolean
  /** The live per-site MySQL socket; empty for every non-running state. */
  socketPath: string
  message: string
  state: LocalWpControlState
}

/**
 * Which of ocsites' two LocalWP setups a project needs, decided by the project's state rather than
 * by the user: `create` for a checkout with no WordPress at its root (ocsites'
 * `setup_localwp_before_clone`), `migrate` for an existing install (`_migrate_to_localwp`).
 */
export type LocalWpSetupMode = 'create' | 'migrate'

export type LocalWpMigrationPlan = {
  /** False when a precondition blocks the setup; `blockedReason` says which. */
  ok: boolean
  blockedReason: string
  mode: LocalWpSetupMode
  sitePath: string
  domain: string
  wordPressRoot: string
  /** Both empty in `create` mode: there is no wp-config.php to read credentials from yet. */
  databaseName: string
  databaseUser: string
  /** Existing app/public contents that a forced run will delete. */
  appPublicEntries: string[]
  moves: { from: string; to: string }[]
  /** Files this setup rewrites in place; empty in `create` mode. */
  edits: string[]
  steps: string[]
}

export type LocalWpMigrationResult = {
  ok: boolean
  message: string
  plan: LocalWpMigrationPlan
  socketPath: string
  localWpRoot: string
  databaseImported: boolean
  log: string[]
}

/**
 * One streamed status line from a running LocalWP migration. Tagged with the siteId because the
 * channel is per-window, not per-request: a second window running its own migration must not have
 * its lines rendered into this one's log.
 */
export type LocalWpMigrationProgressEvent = { siteId: string; message: string }
