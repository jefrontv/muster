// The import step of a site setup: persist the chosen toggles, start the run, and follow its
// events to a terminal status. Split from site-setup-run-steps.ts for size; same StepContext.

import { SITE_IMPORT_TOGGLES } from '../../../../shared/site-types'
import { StepFailure, type StepContext } from './site-setup-run-steps'
import { getSiteSetupRunnerStrings } from './site-setup-runner-strings'

const MAX_LOG_LINES = 200

export async function runImport(ctx: StepContext): Promise<void> {
  const { choices } = ctx
  const strings = getSiteSetupRunnerStrings()
  const environment = ctx.plan?.import.environment || choices.import.environment
  ctx.patchStep('import', { state: 'running' })
  // The planner decides what may run from the environment's toggles, so they are written first.
  const saved = await ctx.api.sites.upsertEnvironment({
    siteId: ctx.state().siteId,
    name: environment,
    patch: Object.fromEntries(
      SITE_IMPORT_TOGGLES.map((toggle) => [toggle.key, choices.import.toggles[toggle.key] ?? true])
    )
  })
  if (!saved.ok) {
    throw new StepFailure(saved.error)
  }

  let runId = ''
  const buffered = new Map<string, string[]>()
  await new Promise<void>((resolve, reject) => {
    const settle = (error: StepFailure | null): void => {
      off()
      ctx.setCancel(null)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    const off = ctx.api.siteRuns.onEvent((event) => {
      if (event.type === 'log') {
        // Lines can land before start() resolves with the id; adopt them once it does.
        const lines = [...(buffered.get(event.runId) ?? []), event.line.text].slice(-MAX_LOG_LINES)
        buffered.set(event.runId, lines)
        if (event.runId === runId) {
          ctx.appendLog('import', event.line.text)
        }
        return
      }
      if (event.runId !== runId) {
        return
      }
      if (event.type === 'progress') {
        ctx.patchStep('import', { percent: event.percent, detail: event.stage })
        return
      }
      if (event.status === 'succeeded') {
        settle(null)
        return
      }
      settle(
        new StepFailure(
          event.error && event.error.length > 0
            ? event.error
            : event.status === 'cancelled'
              ? strings.cancelled
              : strings.importFailed
        )
      )
    })
    void ctx.api.siteRuns
      .start({
        siteId: ctx.state().siteId,
        group: 'import',
        ...(environment ? { environment } : {})
      })
      .then((started) => {
        if (!started.ok) {
          settle(new StepFailure(started.error))
          return
        }
        runId = started.value.id
        ctx.setCancel(() => void ctx.api.siteRuns.cancel(runId))
        ctx.patchStep('import', { cancellable: true, log: buffered.get(runId) ?? [] })
        // A run that finished before its id arrived has no more events coming.
        if (started.value.status === 'succeeded') {
          settle(null)
        } else if (started.value.status === 'failed' || started.value.status === 'cancelled') {
          settle(new StepFailure(started.value.error ?? strings.importFailed))
        }
      }, reject)
  })
  ctx.patchStep('import', {
    state: 'done',
    cancellable: false,
    percent: null,
    detail: strings.imported.replace('{{environment}}', environment)
  })
}
