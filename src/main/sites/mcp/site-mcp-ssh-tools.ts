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
  readLongString,
  readNumber,
  readString,
  resolveMcpSite,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { withProgressHeartbeat } from './site-mcp-progress'
import { CONFIRM_PROPERTY, ENV_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'

/** Long enough for a real remote task (composer install, wp search-replace), short of hanging. */
const SSH_COMMAND_TIMEOUT_MS = 300_000
const MAX_SSH_COMMAND_CHARS = 32_768
const MIN_OUTPUT_CHARS = 1_000
const DEFAULT_OUTPUT_CHARS = 20_000
const MAX_OUTPUT_CHARS = 50_000

function clampOutput(
  value: string,
  maxChars: number,
  tail: boolean
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false }
  }
  return { text: tail ? value.slice(-maxChars) : value.slice(0, maxChars), truncated: true }
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
  const command = readLongString(args, 'command', MAX_SSH_COMMAND_CHARS).trim()
  if (command.length === 0) {
    throw new SiteMcpToolError('command is required.')
  }
  const maxOutputChars = readNumber(
    args,
    'max_output_chars',
    DEFAULT_OUTPUT_CHARS,
    MAX_OUTPUT_CHARS,
    MIN_OUTPUT_CHARS
  )
  const tail = readBoolean(args, 'tail', true)
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
        ? `No SSH password is stored for '${plan.environment ?? '(none)'}'. Set it in Muster or turn on 'Use SSH key' for this environment; confirm=true does not override it.`
        : plan.blockedBy.includes('unmatched-branch')
          ? `Branch '${summary.branch ?? '(none)'}' matches no environment, so this would run on '${plan.environment}' by fallback (which may be production). Re-call with env='${plan.environment}' to target it explicitly, or confirm=true to accept the fallback.`
          : 'This site has no environment to run a command on.'
    }
  }

  const config = await buildSiteRunConfig(site, plan.environment, 'deploy')
  return withProgressHeartbeat(context, 'Remote SSH command', async () => {
    const controller = new AbortController()
    const session = await context.openSshSession(config, controller.signal)
    try {
      const result = await session.exec(command, { timeoutMs: SSH_COMMAND_TIMEOUT_MS })
      const secrets = [config.sshPassword, config.dbPassword]
      const stdout = clampOutput(redactSecrets(result.stdout, secrets), maxOutputChars, tail)
      const stderr = clampOutput(redactSecrets(result.stderr, secrets), maxOutputChars, tail)
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
  })
}

export const SITE_MCP_SSH_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'run_ssh_command',
    description:
      "Run a remote shell command via stored SSH credentials (starts in SSH user's home; cd into site root as needed). Unmatched branch refuses unless env= or confirm=true. Returns exit_code, stdout, stderr (default tail 20k chars each). Prefer read-only inspection; confirm mutating commands with the user first.",
    inputSchema: objectSchema(
      {
        command: {
          type: 'string',
          description:
            "Shell command to run (up to 32k chars), e.g. 'wp option get home' or 'tail -n 50 error_log'."
        },
        max_output_chars: {
          type: 'integer',
          description: 'Per-stream limit, clamped 1000–50000 (default 20000).'
        },
        tail: {
          type: 'boolean',
          description: 'Keep tail instead of head when truncated (default true).'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['command']
    ),
    concurrent: true,
    run: runSshCommand
  }
]
