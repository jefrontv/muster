// The five setup steps, each a thin wrapper over the IPC the old stage components called. The
// runner (site-setup-runner.ts) sequences them and owns the state they report into via `ctx`.
//
// Every failure is thrown as StepFailure carrying the message the row should show. Both migration
// envelopes carry their own `ok` (the IPC result and the migration result inside it); checking only
// the outer one read a blocked migration as success, which is why each is checked here.

import { LOCALWP_ADMIN_EMAIL, LOCALWP_ADMIN_PASSWORD } from '../../../../shared/site-setup-defaults'
import { findSetupStage, type SiteSetupPlan } from '../../../../shared/site-setup-flow-types'
import { repoSlug } from '../../../../shared/site-local-domain'
import { SITE_IMPORT_TOGGLES } from '../../../../shared/site-types'
import { rememberLocalStackChoice } from './last-local-stack-choice'
import type {
  SetupRunStep,
  SetupRunStepId,
  SiteSetupChoices,
  SiteSetupSource
} from './site-setup-choices'
import type { SiteSetupRunnerApi, SiteSetupRunnerSnapshot } from './site-setup-runner'
import { getSiteSetupRunnerStrings } from './site-setup-runner-strings'

export class StepFailure extends Error {}

export type StepContext = {
  api: SiteSetupRunnerApi
  source: SiteSetupSource
  choices: SiteSetupChoices
  /** Null until `reconcile` has read it after the site exists. */
  plan: SiteSetupPlan | null
  setPlan: (plan: SiteSetupPlan) => void
  state: () => SiteSetupRunnerSnapshot
  patch: (next: Partial<SiteSetupRunnerSnapshot>) => void
  patchStep: (id: SetupRunStepId, next: Partial<SetupRunStep>) => void
  appendLog: (id: SetupRunStepId, line: string) => void
  skip: (id: SetupRunStepId, detail: string) => void
  /** What `cancelCurrent` calls while this step runs; cleared by the step when it settles. */
  setCancel: (cancel: (() => void) | null) => void
}

export async function runClone(ctx: StepContext): Promise<void> {
  const { source } = ctx
  const strings = getSiteSetupRunnerStrings()
  const target =
    source.kind === 'repo'
      ? { url: source.repo.cloneUrl, destination: source.destinationRoot, branch: '' }
      : source.kind === 'link' && source.target.kind === 'clone'
        ? {
            url: source.target.cloneUrl,
            destination: source.target.root,
            branch: source.pending.fields.checkoutBranch
          }
        : null
  if (!target) {
    return
  }
  ctx.patchStep('clone', { state: 'running', cancellable: true, percent: 0 })
  const offProgress = ctx.api.repos.onCloneProgress((data) =>
    ctx.patchStep('clone', { percent: data.percent, detail: data.phase })
  )
  const offLog = ctx.api.repos.onCloneLog((data) => ctx.appendLog('clone', data.line))
  ctx.setCancel(() => void ctx.api.repos.cloneAbort())
  try {
    // `repos.clone` takes the PARENT and derives the folder from the URL.
    const repo = await ctx.api.repos.clone({
      url: target.url,
      destination: target.destination,
      ...(target.branch ? { branch: target.branch } : {})
    })
    ctx.patch({ path: repo.path })
    ctx.patchStep('clone', {
      state: 'done',
      cancellable: false,
      percent: null,
      detail: strings.clonedInto.replace('{{path}}', repo.path)
    })
  } catch (error) {
    throw new StepFailure(error instanceof Error ? error.message : String(error))
  } finally {
    offProgress()
    offLog()
    ctx.setCancel(null)
  }
}

/** The single consent write: nothing about the site is persisted before this. */
export async function runRegister(ctx: StepContext): Promise<void> {
  const { source } = ctx
  const strings = getSiteSetupRunnerStrings()
  ctx.patchStep('register', { state: 'running' })
  if (source.kind === 'repo') {
    const created = await ctx.api.sites.create({
      path: ctx.state().path,
      displayName: repoSlug(source.repo.fullName)
    })
    if (!created.ok) {
      throw new StepFailure(created.error)
    }
    ctx.patch({ siteId: created.value.site.id })
  } else if (source.kind === 'link') {
    const path = source.target.kind === 'existing' ? source.target.path : ctx.state().path
    const confirmed = await ctx.api.siteBind.confirm({
      requestId: source.pending.requestId,
      path
    })
    if (!confirmed.ok) {
      throw new StepFailure(confirmed.error)
    }
    ctx.patch({
      siteId: confirmed.value.applied.siteId,
      path: confirmed.value.applied.path,
      secretError: confirmed.value.applied.secretError
    })
  }
  ctx.patchStep('register', { state: 'done', detail: strings.registered })
}

/** One plan read after the site exists; rules out what the review could only guess at. */
export async function reconcile(ctx: StepContext): Promise<void> {
  const { source, choices } = ctx
  // The planner reads import readiness off the environment record, so the toggles the user picked
  // have to be on it before the plan is asked - otherwise it answers "no steps selected".
  const hasImportStep = ctx.state().steps.some((step) => step.id === 'import')
  if (hasImportStep && choices.import.enabled && choices.import.environment.length > 0) {
    const saved = await ctx.api.sites.upsertEnvironment({
      siteId: ctx.state().siteId,
      name: choices.import.environment,
      patch: Object.fromEntries(
        SITE_IMPORT_TOGGLES.map((toggle) => [
          toggle.key,
          choices.import.toggles[toggle.key] ?? true
        ])
      )
    })
    if (!saved.ok) {
      throw new StepFailure(saved.error)
    }
  }
  const reponame =
    source.kind === 'link'
      ? source.pending.fields.reponame
      : source.kind === 'repo'
        ? source.repo.fullName
        : ''
  const result = await ctx.api.siteSetup.plan({
    siteId: ctx.state().siteId,
    reponame,
    branch: null
  })
  if (!result.ok) {
    throw new StepFailure(result.error)
  }
  const plan = result.value
  ctx.setPlan(plan)
  const strings = getSiteSetupRunnerStrings()
  if (!choices.serve.enabled || choices.serve.stack === null) {
    ctx.skip('serve', strings.declined)
  } else if (!plan.stack.supported) {
    ctx.skip('serve', plan.stack.reason)
  }
  const serveSkipped = ctx.state().steps.find((step) => step.id === 'serve')?.state === 'skipped'
  if (serveSkipped) {
    ctx.skip('https', strings.httpsNeedsServe)
  } else if (!choices.https) {
    ctx.skip('https', strings.declined)
  }
  if (!choices.import.enabled) {
    ctx.skip('import', strings.declined)
  } else if (!plan.import.ready && !plan.import.confirmable) {
    // `confirmable` (branch/environment mismatch) does not skip: the run is started with the
    // environment named, which is the override the planner is asking for.
    ctx.skip('import', findSetupStage(plan, 'import')?.reason || strings.importUnavailable)
  }
}

export async function runServe(ctx: StepContext): Promise<void> {
  const { choices, plan } = ctx
  if (!plan || choices.serve.stack === null) {
    return
  }
  const strings = getSiteSetupRunnerStrings()
  const stack = choices.serve.stack
  const domain = choices.serve.domain.trim()
  const stackLabel = stack === 'agent-local' ? strings.agentLocal : strings.localWp
  ctx.patchStep('serve', { state: 'running' })
  const offProgress = ctx.api.siteStacks.onMigrationProgress((event) => {
    if (event.siteId === ctx.state().siteId) {
      ctx.appendLog('serve', event.message)
    }
  })
  try {
    // Already on the chosen stack: nothing to move. A new domain on Agent Local is a rename, the
    // only call that moves a live site (attach refuses a folder it already serves).
    if (plan.stack.stack === stack) {
      if (stack === 'agent-local' && domain.length > 0 && domain !== plan.stack.suggestedDomain) {
        const renamed = await ctx.api.siteStacks.setDomain({ siteId: ctx.state().siteId, domain })
        if (!renamed.ok) {
          throw new StepFailure(renamed.error)
        }
        if (!renamed.value.ok) {
          throw new StepFailure(renamed.value.message)
        }
        ctx.appendLog('serve', renamed.value.message)
      }
      const settled = domain || plan.stack.suggestedDomain
      ctx.patch({ domain: settled })
      ctx.patchStep('serve', {
        state: 'done',
        detail: strings.alreadyServing
          .replace('{{stack}}', stackLabel)
          .replace('{{domain}}', settled)
      })
      return
    }
    const credentials = {
      siteId: ctx.state().siteId,
      domain,
      adminEmail: LOCALWP_ADMIN_EMAIL,
      adminPassword: LOCALWP_ADMIN_PASSWORD,
      stack
    }
    // Preview right before mutating: it is the call that names a conflicting site, an unusable
    // domain, or a non-empty app/public.
    const planned = await ctx.api.siteStacks.previewMigration(credentials)
    if (!planned.ok) {
      throw new StepFailure(planned.error)
    }
    if (!planned.value.ok) {
      throw new StepFailure(planned.value.blockedReason)
    }
    const migrated = await ctx.api.siteStacks.runMigration(credentials)
    if (!migrated.ok) {
      throw new StepFailure(migrated.error)
    }
    if (!migrated.value.ok) {
      throw new StepFailure(migrated.value.message)
    }
    rememberLocalStackChoice(stack)
    ctx.patch({
      domain,
      createdLocalWp: stack === 'localwp' && migrated.value.plan.mode === 'create'
    })
    ctx.patchStep('serve', {
      state: 'done',
      detail: strings.serving.replace('{{stack}}', stackLabel).replace('{{domain}}', domain)
    })
  } finally {
    offProgress()
  }
}

export async function runHttps(ctx: StepContext): Promise<void> {
  const { choices } = ctx
  if (choices.serve.stack === null) {
    return
  }
  const strings = getSiteSetupRunnerStrings()
  const stack = choices.serve.stack
  const domain = ctx.state().domain
  const done = (): void =>
    ctx.patchStep('https', { state: 'done', detail: strings.trusted.replace('{{domain}}', domain) })
  ctx.patchStep('https', { state: 'running' })
  const status = await ctx.api.localwpCert.status({ domain, stack })
  if (!status.ok) {
    throw new StepFailure(status.error)
  }
  if (!status.value.supported) {
    ctx.skip('https', status.value.reason)
    return
  }
  if (status.value.trusted) {
    done()
    return
  }
  const result = status.value.exists
    ? await ctx.api.localwpCert.trust({ domain, stack })
    : await ctx.api.localwpCert.ensure({ domain, siteId: ctx.state().siteId, stack })
  if (!result.ok) {
    throw new StepFailure(result.error)
  }
  if (!result.value.ok) {
    throw new StepFailure(result.value.message)
  }
  const after = await ctx.api.localwpCert.status({ domain, stack })
  if (!after.ok) {
    throw new StepFailure(after.error)
  }
  if (!after.value.trusted) {
    throw new StepFailure(after.value.reason || strings.certNotTrusted)
  }
  done()
}
