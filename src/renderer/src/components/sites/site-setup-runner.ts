// Runs a site setup end to end: clone → register → serve → https → import, one step at a time.
// Step bodies live in site-setup-run-steps.ts; this file owns the sequence, the reported state and
// retry. Pure (no React) so the whole sequence is unit-testable against a fake `window.api`;
// use-site-setup-runner.ts binds it.
//
// Why the sequence lives in the renderer: main already exposes every operation, and the hook that
// owns this runner sits in the always-mounted setup host, so a minimised dialog keeps its run.
//
// `register` is the single consent write. After it, the fresh plan is read once (`reconcile`) and
// a stage the planner rules out is recorded as skipped with its reason rather than attempted, which
// is what lets the review promise a plan before a checkout exists.

import type { PreloadApi } from '../../../../preload/api-types'
import type { SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import {
  SETUP_RUN_STEP_ORDER,
  type SetupRunPhase,
  type SetupRunStep,
  type SetupRunStepId,
  type SiteSetupChoices,
  type SiteSetupSource
} from './site-setup-choices'
import { runImport } from './site-setup-import-step'
import {
  reconcile,
  runClone,
  runHttps,
  runRegister,
  runServe,
  type StepContext
} from './site-setup-run-steps'

const MAX_LOG_LINES = 200

export type SiteSetupRunnerApi = Pick<
  PreloadApi,
  'repos' | 'sites' | 'siteBind' | 'siteSetup' | 'siteStacks' | 'localwpCert' | 'siteRuns'
>

export type SiteSetupRunnerSnapshot = {
  phase: SetupRunPhase
  steps: SetupRunStep[]
  /** Set once `register` has run (or immediately for an existing site). */
  siteId: string
  /** The checkout the site points at; set after clone or from the source. */
  path: string
  /** True when Serve built a fresh LocalWP install, so the done screen shows the admin account. */
  createdLocalWp: boolean
  /** The domain Serve settled on; '' when it did not run. */
  domain: string
  /** Why the bind's password could not be stored; '' otherwise. A warning, not a failure. */
  secretError: string
}

export type SiteSetupRunner = {
  snapshot: () => SiteSetupRunnerSnapshot
  subscribe: (listener: (snapshot: SiteSetupRunnerSnapshot) => void) => () => void
  start: (source: SiteSetupSource, choices: SiteSetupChoices) => Promise<void>
  /** Re-runs from the first failed step with new choices; completed steps are kept. */
  retry: (choices: SiteSetupChoices) => Promise<void>
  cancelCurrent: () => void
  /** Steps that already completed, so the review can lock their rows on retry. */
  completedSteps: () => SetupRunStepId[]
}

const IDLE: SiteSetupRunnerSnapshot = {
  phase: 'idle',
  steps: [],
  siteId: '',
  path: '',
  createdLocalWp: false,
  domain: '',
  secretError: ''
}

const STEP_RUNNERS: Record<SetupRunStepId, (ctx: StepContext) => Promise<void>> = {
  clone: runClone,
  register: runRegister,
  serve: runServe,
  https: runHttps,
  import: runImport
}

/** Only these are decided by the plan; clone and register run whenever they are present. */
const OPTIONAL_STEPS: readonly SetupRunStepId[] = ['serve', 'https', 'import']

function stepsFor(source: SiteSetupSource): SetupRunStep[] {
  const hasClone =
    source.kind === 'repo' || (source.kind === 'link' && source.target.kind === 'clone')
  return SETUP_RUN_STEP_ORDER.filter((id) => {
    if (id === 'clone') {
      return hasClone
    }
    if (id === 'register') {
      return source.kind !== 'site'
    }
    return true
  }).map((id) => ({ id, state: 'pending', detail: '', log: [], percent: null, cancellable: false }))
}

export function createSiteSetupRunner(api: SiteSetupRunnerApi): SiteSetupRunner {
  const listeners = new Set<(snapshot: SiteSetupRunnerSnapshot) => void>()
  let state = IDLE
  let source: SiteSetupSource | null = null
  let choices: SiteSetupChoices | null = null
  let plan: SiteSetupPlan | null = null
  let cancel: (() => void) | null = null

  const patch = (next: Partial<SiteSetupRunnerSnapshot>): void => {
    state = { ...state, ...next }
    for (const listener of listeners) {
      listener(state)
    }
  }
  const patchStep = (id: SetupRunStepId, next: Partial<SetupRunStep>): void => {
    patch({ steps: state.steps.map((step) => (step.id === id ? { ...step, ...next } : step)) })
  }
  const context = (): StepContext | null => {
    if (!source || !choices) {
      return null
    }
    return {
      api,
      source,
      choices,
      plan,
      setPlan: (next) => {
        plan = next
      },
      state: () => state,
      patch,
      patchStep,
      appendLog: (id, line) => {
        const step = state.steps.find((entry) => entry.id === id)
        if (step) {
          patchStep(id, { log: [...step.log, line].slice(-MAX_LOG_LINES) })
        }
      },
      skip: (id, detail) => patchStep(id, { state: 'skipped', detail }),
      setCancel: (next) => {
        cancel = next
      }
    }
  }

  const fail = (id: SetupRunStepId, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error)
    const index = state.steps.findIndex((entry) => entry.id === id)
    patch({
      phase: 'failed',
      steps: state.steps.map((entry, position) =>
        entry.id === id
          ? { ...entry, state: 'failed', detail: message, cancellable: false, percent: null }
          : position > index && entry.state === 'pending'
            ? { ...entry, state: 'not-run' }
            : entry
      )
    })
  }

  const runFrom = async (startAt: SetupRunStepId | null): Promise<void> => {
    patch({ phase: 'running' })
    let reached = startAt === null
    let reconciled = state.siteId.length > 0 && plan !== null
    for (const { id } of state.steps) {
      if (!reached) {
        reached = id === startAt
        if (!reached) {
          continue
        }
      }
      // Reconcile once the site exists, before the first optional stage decides anything.
      if (!reconciled && OPTIONAL_STEPS.includes(id)) {
        const ctx = context()
        if (!ctx) {
          return
        }
        try {
          await reconcile(ctx)
        } catch (error) {
          fail(id, error)
          return
        }
        reconciled = true
      }
      const current = state.steps.find((entry) => entry.id === id)
      if (!current || current.state === 'done' || current.state === 'skipped') {
        continue
      }
      const ctx = context()
      if (!ctx) {
        return
      }
      try {
        await STEP_RUNNERS[id](ctx)
      } catch (error) {
        fail(id, error)
        return
      }
    }
    patch({ phase: 'done' })
  }

  return {
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start: async (nextSource, nextChoices) => {
      source = nextSource
      choices = nextChoices
      plan = null
      patch({
        ...IDLE,
        steps: stepsFor(nextSource),
        siteId: nextSource.kind === 'site' ? nextSource.siteId : '',
        path:
          nextSource.kind === 'link' && nextSource.target.kind === 'existing'
            ? nextSource.target.path
            : ''
      })
      await runFrom(null)
    },
    retry: async (nextChoices) => {
      choices = nextChoices
      const firstFailed = state.steps.find((step) => step.state === 'failed')
      if (!firstFailed) {
        return
      }
      // Choices may have changed, so anything not yet done is decided again by reconcile.
      plan = null
      patch({
        steps: state.steps.map((step) =>
          step.state === 'done'
            ? step
            : { ...step, state: 'pending', detail: '', log: [], percent: null, cancellable: false }
        )
      })
      await runFrom(firstFailed.id)
    },
    cancelCurrent: () => {
      cancel?.()
    },
    completedSteps: () => state.steps.filter((step) => step.state === 'done').map((step) => step.id)
  }
}
