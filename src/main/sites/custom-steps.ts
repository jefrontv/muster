// Runs user-authored steps as part of an import or deploy.
//
// Why this exists: built-in steps are compile-time boolean keys destructured by name in the
// pipelines, so a user-defined step cannot be one. It is data instead — a named command this
// generic runner executes in pipeline order.
//
// Remote steps reuse the run's existing SSH session (one session per run, as every built-in remote
// step does). Local steps reuse the same shell path the theme build already runs on, so cancellation
// and output streaming behave identically.

import { randomUUID } from 'node:crypto'
import { streamCommand } from '../lib/stream-command'
import { readScriptWithin, resolveScriptWithin } from './custom-step-script'
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
  customStepEnvName,
  customStepSource,
  selectCustomSteps,
  type CustomStepPlaceholderName,
  type CustomStepSource,
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

/**
 * Values a script reads from its environment. Same source list as the placeholders, so a value the
 * editor advertises is reachable from either style of step.
 */
export function buildCustomStepEnv(config: SiteRunConfig): Record<string, string> {
  const placeholders = buildCustomStepPlaceholders(config)
  return Object.fromEntries(
    CUSTOM_STEP_PLACEHOLDERS.map((placeholder) => [
      customStepEnvName(placeholder.name),
      placeholders[placeholder.name] ?? ''
    ])
  )
}

/** Absolute path inside the checkout, or a step error naming why the path was refused. */
export function resolveCustomStepScriptPath(
  sitePath: string,
  scriptPath: string,
  stepLabel: string
): string {
  const absolute = resolveScriptWithin(sitePath, scriptPath)
  if (!absolute) {
    throw new SiteRunStepError(
      stepLabel,
      `Script path must stay inside the checkout: ${scriptPath} is absolute, escapes with .., or is empty.`
    )
  }
  return absolute
}

async function readStepScript(
  sitePath: string,
  scriptPath: string,
  stepLabel: string
): Promise<string> {
  resolveCustomStepScriptPath(sitePath, scriptPath, stepLabel)
  const contents = await readScriptWithin(sitePath, scriptPath)
  if (contents === null) {
    throw new SiteRunStepError(
      stepLabel,
      `Script not found in the checkout: ${scriptPath}. Create it, or point the step at a file that exists.`
    )
  }
  return contents
}

/** `NAME='value' NAME2='value2' ` — a prefix the remote shell applies to one command. */
function remoteEnvPrefix(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([name, value]) => `${name}=${quoteShellArgument(value)}`)
    .join(' ')
}

async function runOneCustomStep(
  context: SiteRunContext,
  config: SiteRunConfig,
  step: SiteCustomStep,
  session: SiteSshSession | null,
  dependencies: CustomStepDependencies
): Promise<void> {
  const stepLabel = `Custom step: ${step.name}`
  const source = customStepSource(step)
  if (!source) {
    throw new SiteRunStepError(stepLabel, 'Step has neither a command nor a script path.')
  }
  const env = buildCustomStepEnv(config)

  context.throwIfCancelled()
  context.status(step.name)
  context.log(
    `${stepLabel} (${step.runsOn}${source.kind === 'script' ? `, ${source.scriptPath}` : ''})`
  )

  if (step.runsOn === 'remote') {
    if (!session) {
      throw new SiteRunStepError(
        stepLabel,
        'This step runs on the server, but the run has no SSH session. Check the environment has a hostname, username and stored password.'
      )
    }
    await runRemoteStep(context, config, step, source, session, env, stepLabel)
    return
  }

  await runLocalStep(context, config, step, source, dependencies, env, stepLabel)
}

async function runRemoteStep(
  context: SiteRunContext,
  config: SiteRunConfig,
  step: SiteCustomStep,
  source: CustomStepSource,
  session: SiteSshSession,
  env: Record<string, string>,
  stepLabel: string
): Promise<void> {
  // A script is uploaded and run by path, so its text is never parsed by an intermediate shell —
  // that is what makes multi-line scripts with nested quotes safe over SSH.
  let remotePath: string | null = null
  let command: string
  if (source.kind === 'script') {
    const contents = await readStepScript(config.site.path, source.scriptPath, stepLabel)
    remotePath = `/tmp/muster-step-${randomUUID()}.sh`
    await session.writeSecureRemoteFile(remotePath, contents)
    command = `${remoteEnvPrefix(env)} bash ${quoteShellArgument(remotePath)}`
  } else {
    command = resolveCustomStepCommand(
      source.command,
      buildCustomStepPlaceholders(config),
      step.name
    )
  }

  try {
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
  } finally {
    // Best-effort by contract, and it must run even when the step failed or the run was cancelled.
    if (remotePath) {
      await session.removeRemoteFile(remotePath)
    }
  }
}

async function runLocalStep(
  context: SiteRunContext,
  config: SiteRunConfig,
  step: SiteCustomStep,
  source: CustomStepSource,
  dependencies: CustomStepDependencies,
  env: Record<string, string>,
  stepLabel: string
): Promise<void> {
  const script =
    source.kind === 'script'
      ? // Passed TO bash rather than executed: the file needs no execute bit, so an agent can
        // commit a step script without anyone remembering to chmod it. Same shape as the remote
        // side, which runs the uploaded 0600 copy the same way.
        `bash ${quoteShellArgument(
          resolveCustomStepScriptPath(config.site.path, source.scriptPath, stepLabel)
        )}`
      : resolveCustomStepCommand(source.command, buildCustomStepPlaceholders(config), step.name)

  const result = await runDeployShellScript(
    dependencies.runCommand ?? streamCommand,
    source.kind === 'script' ? '/bin/bash' : '/bin/sh',
    script,
    {
      cwd: config.site.path,
      signal: context.signal,
      timeoutMs: 0,
      env: source.kind === 'script' ? env : undefined,
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
