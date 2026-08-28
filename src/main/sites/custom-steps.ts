// Runs user-authored steps as part of an import or deploy.
//
// Why this exists: built-in steps are compile-time boolean keys destructured by name in the
// pipelines, so a user-defined step cannot be one. It is data instead — a named command this
// generic runner executes in pipeline order.
//
// Remote steps reuse the run's existing SSH session (one session per run, as every built-in remote
// step does). Local steps reuse the same shell path the theme build already runs on, so cancellation
// and output streaming behave identically.

import { streamCommand } from '../lib/stream-command'
import {
  quoteShellArgument,
  SiteRunStepError,
  type SiteRunConfig,
  type SiteRunContext,
  type SiteSshSession
} from './pipeline-contract'
import { runDeployShellScript } from './theme-build'
import {
  CUSTOM_STEP_PLACEHOLDERS,
  selectCustomSteps,
  type CustomStepPlaceholderName,
  type SiteCustomStep,
  type SiteCustomStepPosition,
  type SiteRunGroup
} from '../../shared/site-types'

export type CustomStepDependencies = {
  runCommand?: typeof streamCommand
}

/**
 * Values a step may reference. Deliberately no passwords: a command that needs a credential must
 * fetch it itself, so a step definition can never carry one and no secret reaches the run log
 * through substitution.
 */
export function buildCustomStepPlaceholders(config: SiteRunConfig): Record<string, string> {
  const values: Record<CustomStepPlaceholderName, string> = {
    sitePath: config.site.path,
    wpDir: config.wpDir,
    remoteRoot: config.environment.rootPath,
    liveDomain: config.environment.liveDomain,
    localDomain: config.site.localDomain,
    environment: config.environmentName
  }
  // Built from the shared list so a placeholder the editor advertises always resolves here.
  return Object.fromEntries(
    CUSTOM_STEP_PLACEHOLDERS.map((placeholder) => [placeholder.name, values[placeholder.name]])
  )
}

/**
 * Substitutes `{{name}}` placeholders. Remote commands get shell-quoted values because they are
 * interpolated into a string the remote shell parses; local commands run through the same quoting
 * for consistency. An unknown placeholder is a step authoring error, not a silent empty string.
 */
export function resolveCustomStepCommand(
  command: string,
  placeholders: Record<string, string>,
  stepName: string
): string {
  return command.replaceAll(/\{\{(\w+)\}\}/g, (_match, rawName: string) => {
    const value = placeholders[rawName]
    if (value === undefined) {
      throw new SiteRunStepError(
        `Custom step: ${stepName}`,
        `Unknown placeholder {{${rawName}}}. Available: ${Object.keys(placeholders).sort().join(', ')}`
      )
    }
    return quoteShellArgument(value)
  })
}

async function runOneCustomStep(
  context: SiteRunContext,
  config: SiteRunConfig,
  step: SiteCustomStep,
  session: SiteSshSession | null,
  dependencies: CustomStepDependencies
): Promise<void> {
  const stepLabel = `Custom step: ${step.name}`
  const command = resolveCustomStepCommand(
    step.command,
    buildCustomStepPlaceholders(config),
    step.name
  )

  context.throwIfCancelled()
  context.status(step.name)
  context.log(`${stepLabel} (${step.runsOn})`)

  if (step.runsOn === 'remote') {
    if (!session) {
      throw new SiteRunStepError(
        stepLabel,
        'This step runs on the server, but the run has no SSH session. Check the environment has a hostname, username and stored password.'
      )
    }
    const result = await session.exec(command, {
      timeoutMs: 0,
      onStdout: (chunk) => context.log(chunk.trimEnd()),
      onStderr: (chunk) => context.log(chunk.trimEnd())
    })
    if (result.code !== 0) {
      throw new SiteRunStepError(
        stepLabel,
        `Exited with code ${result.code}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`
      )
    }
    return
  }

  const result = await runDeployShellScript(
    dependencies.runCommand ?? streamCommand,
    '/bin/sh',
    command,
    {
      cwd: config.site.path,
      signal: context.signal,
      timeoutMs: 0,
      onOutput: (chunk) => context.log(chunk.trimEnd())
    }
  )
  if (result.code !== 0) {
    throw new SiteRunStepError(stepLabel, `Exited with code ${result.code}`)
  }
}

/**
 * Runs every enabled custom step for one group and position, in order. Called twice per group by
 * each pipeline — once before the built-in steps, once after — which is what lets a pair of steps
 * bracket a run (maintenance mode on, then off).
 */
export async function runCustomSteps(
  context: SiteRunContext,
  config: SiteRunConfig,
  group: SiteRunGroup,
  position: SiteCustomStepPosition,
  session: SiteSshSession | null,
  dependencies: CustomStepDependencies = {}
): Promise<void> {
  const steps = selectCustomSteps(config.site, group, position)
  for (const step of steps) {
    await runOneCustomStep(context, config, step, session, dependencies)
  }
}

/** True when a group has any enabled custom step that needs the SSH session. */
export function customStepsNeedRemote(
  config: Pick<SiteRunConfig, 'site'>,
  group: SiteRunGroup
): boolean {
  return selectCustomSteps(config.site, group).some((step) => step.runsOn === 'remote')
}
