// The contract between the setup review (what the user agreed to), the runner (what it does about
// it) and the run screen (what it reports). Pure types plus the defaults the review opens with.
//
// Nothing here is persisted: a Site record only comes into being when the runner's `register`
// step writes it, which is the single consent point of the whole dialog.

import type { PendingSiteBind } from '../../../../shared/site-bind-types'
import type { CloneSourceRepo } from '../../../../shared/site-clone-source-types'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import {
  SITE_IMPORT_TOGGLES,
  type SiteImportToggleKey,
  type SiteLocalStack
} from '../../../../shared/site-types'

/** Where the site comes from. Decides which steps the run has and what `register` writes. */
export type SiteSetupSource =
  | { kind: 'repo'; repo: CloneSourceRepo; destinationRoot: string }
  | {
      kind: 'link'
      pending: PendingSiteBind
      /** An existing checkout to bind, or a root to clone the link's repository into. */
      target: { kind: 'existing'; path: string } | { kind: 'clone'; root: string; cloneUrl: string }
    }
  /** Finish setup on a site that already exists: no clone, no register. */
  | { kind: 'site'; siteId: string }

export type SiteSetupChoices = {
  serve: {
    enabled: boolean
    /** Null only when no managed stack is installed; the Serve row is then unavailable. */
    stack: SiteLocalStack | null
    domain: string
  }
  https: boolean
  import: {
    enabled: boolean
    environment: string
    toggles: Record<SiteImportToggleKey, boolean>
    /** The run planner reported a branch/environment mismatch and the user chose to import anyway. */
    confirmMismatch: boolean
  }
}

export const SETUP_RUN_STEP_ORDER = ['clone', 'register', 'serve', 'https', 'import'] as const
export type SetupRunStepId = (typeof SETUP_RUN_STEP_ORDER)[number]

export type SetupRunStepState =
  | 'pending'
  | 'running'
  | 'done'
  /** Declined on the review, or ruled out by the fresh plan after `register`; `detail` says which. */
  | 'skipped'
  | 'failed'
  /** Never reached because an earlier step failed. */
  | 'not-run'

export type SetupRunStep = {
  id: SetupRunStepId
  state: SetupRunStepState
  /** One line for the row: the reason when skipped or failed, the result when done. */
  detail: string
  log: string[]
  /** 0-100 while a step reports progress; null otherwise. */
  percent: number | null
  /** True while the step can be interrupted (clone, import). Serve cannot. */
  cancellable: boolean
}

export type SetupRunPhase = 'idle' | 'running' | 'done' | 'failed'

/** Every toggle on: what a first-time import needs, exactly as the old import stage seeded them. */
export function allImportToggles(): Record<SiteImportToggleKey, boolean> {
  return Object.fromEntries(SITE_IMPORT_TOGGLES.map((toggle) => [toggle.key, true])) as Record<
    SiteImportToggleKey,
    boolean
  >
}

/**
 * Choices the review opens with, from a plan when there is one (link or existing site) and from
 * what is knowable without a checkout otherwise. `stack` is the caller's pick since it depends on
 * what is installed, which is a separate call.
 */
export function defaultSetupChoices(args: {
  plan: SiteSetupPlan | null
  domain: string
  stack: SiteLocalStack | null
  certSupported: boolean
  environment: string
}): SiteSetupChoices {
  const stackAvailable = args.plan ? args.plan.stack.supported : true
  const importAvailable = args.plan
    ? args.plan.import.ready || args.plan.import.confirmable
    : args.environment.length > 0
  return {
    serve: {
      enabled: stackAvailable && args.stack !== null,
      stack: args.stack,
      domain: args.domain
    },
    https: stackAvailable && args.stack !== null && args.certSupported,
    import: {
      enabled: importAvailable,
      environment: args.environment,
      toggles: allImportToggles(),
      confirmMismatch: false
    }
  }
}
