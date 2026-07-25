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

export type LocalWpMigrationPlan = {
  /** False when a precondition blocks the migration; `blockedReason` says which. */
  ok: boolean
  blockedReason: string
  sitePath: string
  domain: string
  wordPressRoot: string
  databaseName: string
  databaseUser: string
  /** Existing app/public contents that a forced run will delete. */
  appPublicEntries: string[]
  moves: { from: string; to: string }[]
  /** Files this migration rewrites in place. */
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
