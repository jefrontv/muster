// The guided setup a `muster://configure?…` link runs, ported from the ocsites flow where one link
// could take you from "nothing on disk" to a working local site.
//
// Four stages, each independently skippable and each gated on real state rather than optimism:
//
//   target  pick an existing checkout, or clone one through a configured git connector
//   bind    write the Site record + SSH secret (this is the only stage that always runs)
//   stack   offer LocalWP when the folder is a plain WordPress install
//   import  offer to pull the remote DB + files once credentials actually allow it
//
// Why a planner type rather than ad-hoc component state: every stage can be blocked for a reason
// the user has to act on (no clone URL, not macOS, missing SSH password, branch/environment
// mismatch). Modelling that explicitly keeps the dialog honest — it can never offer a button that
// would fail, and it can always say why a stage is unavailable.

import type { SiteRunBlockedReason } from './site-run-types'
import type { SiteLocalStack } from './site-types'

export type SiteSetupStageId = 'target' | 'bind' | 'stack' | 'import'

export type SiteSetupStageState =
  /** Not reached yet. */
  | 'pending'
  /** Awaiting the user right now. */
  | 'active'
  | 'done'
  /** The user declined it. */
  | 'skipped'
  /** Reachable in principle, but something must be fixed first — `reason` says what. */
  | 'blocked'
  /** Cannot apply to this machine or site at all (e.g. LocalWP off macOS). */
  | 'unavailable'

export type SiteSetupStage = {
  id: SiteSetupStageId
  state: SiteSetupStageState
  /** Empty unless blocked/unavailable. Written for the user, not the log. */
  reason: string
}

/** A repository the link could be cloned from, resolved through a configured connector. */
export type SiteSetupCloneTarget = {
  /** `bitbucket` today; the shape allows more connectors without a UI change. */
  provider: 'bitbucket'
  /** `workspace/repo`. */
  fullName: string
  /** SSH preferred; falls back to HTTPS when the connector reports no SSH remote. */
  cloneUrl: string
  /** True when the link's `reponame` matched this repo exactly rather than fuzzily. */
  exactMatch: boolean
}

export type SiteSetupCloneResolution = {
  /** False when no connector is configured — the UI should point at Settings, not show an error. */
  connectorConfigured: boolean
  targets: SiteSetupCloneTarget[]
  /** Set when the connector was configured but the lookup itself failed. */
  error: string
}

export type SiteSetupStackReadiness = {
  /** False off macOS, where neither managed stack can be driven at all. */
  supported: boolean
  /** True when the folder is already on a managed stack, so migration is a no-op. */
  alreadyLocalWp: boolean
  /** Which stack detection found; `plain` when none manages the folder. */
  stack: SiteLocalStack
  /** Proposed local domain, derived from the link or the folder name. */
  suggestedDomain: string
  reason: string
}

export type SiteSetupImportReadiness = {
  /** True when `canStartRun` would accept the run without an override. */
  ready: boolean
  /** Straight from the run planner, so the dialog and the run console agree. */
  blockedBy: SiteRunBlockedReason[]
  /** True when the block is only a branch/environment mismatch the user may override. */
  confirmable: boolean
  environment: string
  /** Count of enabled import steps; zero means the link configured nothing to run. */
  enabledStepCount: number
}

export type SiteSetupPlan = {
  siteId: string
  stages: SiteSetupStage[]
  clone: SiteSetupCloneResolution
  stack: SiteSetupStackReadiness
  import: SiteSetupImportReadiness
}

export function findSetupStage(plan: SiteSetupPlan, id: SiteSetupStageId): SiteSetupStage | null {
  return plan.stages.find((stage) => stage.id === id) ?? null
}

/** The stage the dialog should be showing: the first one still awaiting the user. */
export function activeSetupStage(plan: SiteSetupPlan): SiteSetupStageId | null {
  return (
    plan.stages.find((stage) => stage.state === 'active' || stage.state === 'pending')?.id ?? null
  )
}
