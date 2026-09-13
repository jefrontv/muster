// The done screen retires the LocalWP credentials card on `databaseReplaced`, so the run has to be
// the one that sets it — a render-side test cannot catch the flag never being recorded, and then
// the card would come back for the user who reported it. Drives runImport against a fake
// StepContext: the step's own decision, no renderer, no main process.
//
// The flag is keyed on the run's stage stream, not on the run succeeding: a run that replaces the
// database and then fails or is cancelled in a later step still has to retire the card, and a run
// that fails before the database step must not.

import { describe, expect, it } from 'vitest'
import type { SiteRunEvent } from '../../../../shared/site-run-types'
import type { SiteSetupRunnerSnapshot } from './site-setup-runner'
import { allImportToggles, type SiteSetupChoices, type SiteSetupSource } from './site-setup-choices'
import { runImport } from './site-setup-import-step'
import type { StepContext } from './site-setup-run-steps'

const RUN_ID = 'run-1'

/** A context whose run is driven event by event; only the patch traffic is under test. */
function context(exportDatabase: boolean): {
  ctx: StepContext
  patched: Partial<SiteSetupRunnerSnapshot>[]
  emit: (event: SiteRunEvent) => void
} {
  const patched: Partial<SiteSetupRunnerSnapshot>[] = []
  const choices: SiteSetupChoices = {
    serve: { enabled: true, stack: 'localwp', domain: 'flex.local' },
    https: true,
    import: {
      enabled: true,
      environment: 'production',
      toggles: { ...allImportToggles(), exportDatabase }
    }
  }
  const source: SiteSetupSource = { kind: 'site', siteId: 'site-1' }
  let state: SiteSetupRunnerSnapshot = {
    phase: 'running',
    steps: [],
    siteId: 'site-1',
    path: '',
    createdLocalWp: true,
    databaseReplaced: false,
    domain: 'flex.local',
    secretError: ''
  }
  let listener: ((event: SiteRunEvent) => void) | null = null
  const ctx: StepContext = {
    api: {
      siteRuns: {
        onEvent: (next: (event: SiteRunEvent) => void) => {
          listener = next
          return () => {
            listener = null
          }
        },
        start: async () => ({ ok: true, value: { id: RUN_ID, status: 'running' } })
      }
    } as unknown as StepContext['api'],
    source,
    choices,
    plan: null,
    setPlan: () => {},
    state: () => state,
    patch: (next) => {
      patched.push(next)
      state = { ...state, ...next }
    },
    patchStep: () => {},
    appendLog: () => {},
    skip: () => {},
    setCancel: () => {}
  }
  return { ctx, patched, emit: (event) => listener?.(event) }
}

const stage = (text: string): SiteRunEvent => ({
  type: 'progress',
  runId: RUN_ID,
  stage: text,
  transferred: 0,
  total: 0,
  percent: null
})

const status = (next: 'succeeded' | 'failed' | 'cancelled', error?: string): SiteRunEvent => ({
  type: 'status',
  runId: RUN_ID,
  status: next,
  ...(error ? { error } : {})
})

const replaced = (patched: Partial<SiteSetupRunnerSnapshot>[]): boolean =>
  patched.some((entry) => entry.databaseReplaced === true)

/** Lets start()'s resolved promise run its `.then`, so runImport has adopted the run id first. */
const adoptRunId = (): Promise<void> => Promise.resolve()

describe('runImport', () => {
  it('marks the database replaced the moment the localwp load starts, not when the run ends', async () => {
    const { ctx, patched, emit } = context(true)

    const running = runImport(ctx)
    await adoptRunId()
    emit(stage('Importing database'))
    // Still in flight: the card is already retired, which is what survives a later failure.
    expect(replaced(patched)).toBe(true)
    emit(status('succeeded'))
    await running

    expect(replaced(patched)).toBe(true)
  })

  it('marks the database replaced on the agent-local load stage too', async () => {
    const { ctx, patched, emit } = context(true)

    const running = runImport(ctx)
    await adoptRunId()
    emit(stage('Loading database through Agent Local…'))
    emit(status('succeeded'))
    await running

    expect(replaced(patched)).toBe(true)
  })

  // The reported bug: the import replaced the database and a later step (upload rewrite, custom
  // `after` step, the agent-local verdict) failed, so the run never reached the success path that
  // used to set this flag — and the card named an account the import had just destroyed.
  it('keeps the database marked replaced when a later step fails the run', async () => {
    const { ctx, patched, emit } = context(true)

    const running = runImport(ctx)
    await adoptRunId()
    emit(stage('Importing database'))
    emit(status('failed', 'The site did not answer after the import.'))
    await expect(running).rejects.toThrow('did not answer')
    expect(replaced(patched)).toBe(true)
  })

  it('keeps the database marked replaced when the run is cancelled after the load', async () => {
    const { ctx, patched, emit } = context(true)

    const running = runImport(ctx)
    await adoptRunId()
    emit(stage('Importing database'))
    emit(status('cancelled'))
    await expect(running).rejects.toThrow()
    expect(replaced(patched)).toBe(true)
  })

  // A run that dies before the database step left the LocalWP house account in place, so the card
  // is still the right thing to show.
  it('records nothing when the run fails before the database step', async () => {
    const { ctx, patched, emit } = context(true)

    const running = runImport(ctx)
    await adoptRunId()
    emit(stage('Extracting flex.zip…'))
    emit(status('failed', 'SSH authentication failed'))
    await expect(running).rejects.toThrow('SSH authentication failed')

    expect(replaced(patched)).toBe(false)
  })

  // A files-only run — the DB toggle off, e.g. search-replace plus upload-rewrite — leaves the
  // LocalWP house account sitting in an untouched database, so the card must keep naming it.
  it('records nothing when the run only pulled files', async () => {
    const { ctx, patched, emit } = context(false)

    const running = runImport(ctx)
    await adoptRunId()
    emit(stage('Extracting flex.zip…'))
    emit(status('succeeded'))
    await running

    expect(replaced(patched)).toBe(false)
  })
})
