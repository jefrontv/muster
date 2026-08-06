// run_ssh_command: one arbitrary command on a site's remote host, over the same SSH session the
// import/deploy pipelines use (stored credential, ssh2, tree-killed on cancel).
//
// The safety model is the RUN model, minus the step list: the environment a command lands on is
// resolved from the checked-out branch exactly as a deploy resolves it, and a branch that matches
// no environment REFUSES rather than falling back onto what is usually production. `confirm=true`
// or an explicit `env=` overrides that one condition and nothing else — a missing SSH credential
// still refuses, because there is nothing to authenticate with.
//
// The command itself is not policed. That is a deliberate product decision (the operator owns
// these servers and these credentials); what this module guarantees instead is that the operator
// always knows WHICH host a command reached, and that no credential can be read back out of the
// result.

import type { Site } from '../../../shared/site-types'
import { buildSiteRunConfig } from '../site-run-config'
import { buildSiteToolPlan, canStartRun } from '../site-run-plan'
import {
  readBoolean,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { CONFIRM_PROPERTY, ENV_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

/** Long enough for a real remote task (composer install, wp search-replace), short of hanging. */
const SSH_COMMAND_TIMEOUT_MS = 300_000

/** Output cap per stream. A model does not need a 40MB log to answer, and the wire is stdio. */
const MAX_OUTPUT_CHARS = 20_000

function clampOutput(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_OUTPUT_CHARS) {
    return { text: value, truncated: false }
  }
  // Keep the TAIL: the end of a command's output is where the result and the error live.
  return { text: value.slice(-MAX_OUTPUT_CHARS), truncated: true }
}

/** Defence in depth: the connection layer already avoids echoing secrets, this catches the rest. */
function redactSecrets(value: string, secrets: readonly string[]): string {
  let out = value
  for (const secret of secrets) {
    if (secret.length > 0) {
      out = out.split(secret).join('***')
    }
  }
  return out
}

async function runSshCommand(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const command = readString(args, 'command').trim()
  if (command.length === 0) {
    throw new SiteMcpToolError('command is required.')
  }
  const site: Site = resolveMcpSite(context, readString(args, 'site'))
  const requested = readString(args, 'env')
  if (requested.length > 0 && !Object.hasOwn(site.environments, requested)) {
    throw new SiteMcpToolError(`Environment '${requested}' not found for this site.`, {
      available_environments: Object.keys(site.environments)
    })
  }

  const summary = await context.summarize(site)
  // The tool plan is the run guard with this command standing in for the toggle list, so an
  // unmatched branch refuses here for the same reason a deploy does.
  const plan = buildSiteToolPlan({
    site,
    // 'deploy' because a command reaches the live host the way a deploy does; the step list a
    // group would imply is replaced by this single step, so the group only shapes the wording.
    group: 'deploy',
    step: { key: 'ssh-command', label: 'Run a remote command', remote: true },
    branch: summary.branch,
    requestedEnvironment: requested.length > 0 ? requested : null,
    hasSshSecret: (environment) => context.hasSshSecret(site.id, environment),
    pathExists: summary.pathExists
  })
  const confirmed = readBoolean(args, 'confirm')
  if (!canStartRun(plan, confirmed) || !plan.environment) {
    return {
      ok: false,
      blocked: true,
      needs_confirmation: plan.confirmable,
      site: site.displayName,
      site_id: site.id,
      command,
      current_branch: summary.branch ?? '',
      resolved_environment: plan.environment,
      blocked_by: plan.blockedBy,
      message: plan.blockedBy.includes('missing-ssh-credentials')
        ? `No SSH password is stored for '${plan.environment ?? '(none)'}'. Set it in Muster; confirm=true does not override it.`
        : plan.blockedBy.includes('unmatched-branch')
          ? `Branch '${summary.branch ?? '(none)'}' matches no environment, so this would run on '${plan.environment}' by fallback (which may be production). Re-call with env='${plan.environment}' to target it explicitly, or confirm=true to accept the fallback.`
          : 'This site has no environment to run a command on.'
    }
  }

  const config = buildSiteRunConfig(site, plan.environment, 'deploy')
  const controller = new AbortController()
  const session = await context.openSshSession(config, controller.signal)
  try {
    const result = await session.exec(command, { timeoutMs: SSH_COMMAND_TIMEOUT_MS })
    const secrets = [config.sshPassword, config.dbPassword]
    const stdout = clampOutput(redactSecrets(result.stdout, secrets))
    const stderr = clampOutput(redactSecrets(result.stderr, secrets))
    return {
      ok: result.code === 0,
      site: site.displayName,
      site_id: site.id,
      environment: plan.environment,
      host: `${config.environment.username}@${config.environment.hostname}`,
      command,
      exit_code: result.code,
      stdout: stdout.text,
      stderr: stderr.text,
      output_truncated: stdout.truncated || stderr.truncated
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}

export const SITE_MCP_SSH_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'run_ssh_command',
    description:
      "Run a shell command on a site's remote server over SSH, using the environment's stored credential. The command runs in the SSH user's default directory — cd into the site root yourself when you need it. With env omitted the environment is inferred from the checked-out git branch; a branch matching no environment REFUSES (it would otherwise fall back to what is usually production) unless env= is passed or confirm=true. Returns exit_code, stdout and stderr (tail-truncated at 20k chars each). Commands are not sandboxed: prefer read-only inspection, and tell the user what you are about to run before anything that writes.",
    inputSchema: objectSchema(
      {
        command: {
          type: 'string',
          description:
            "The shell command to run, e.g. 'wp option get home' or 'tail -n 50 error_log'."
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['command']
    ),
    run: runSshCommand
  }
]
