// Executes one whitelisted WP-CLI quick action on a site's remote host. Same guard model as the
// MCP run_ssh_command tool: the branch resolves the environment exactly as a deploy would, an
// unmatched branch refuses unless the caller confirmed, and a missing SSH credential always
// refuses. The command itself comes from the shared whitelist, never from the caller.

import type { Site } from '../../shared/site-types'
import { getSiteWpCliAction, type SiteWpCliResult } from '../../shared/site-wp-cli-actions'
import { quoteShellArgument } from './pipeline-contract'
import { buildSiteRunConfig } from './site-run-config'
import { buildSiteToolPlan, canStartRun } from './site-run-plan'
import { getSiteSecretPresence } from './site-secret-store'
import { createSiteSshSession } from './site-ssh-session'
import { buildSiteSummary } from './site-summary'

/** Quick actions are interactive: long enough for `wp db size` on a big DB, short of hanging UI. */
const WP_CLI_TIMEOUT_MS = 120_000

/** The panel shows a tail, not a console. */
const MAX_OUTPUT_CHARS = 8_000

function clampOutput(value: string): { text: string; truncated: boolean } {
  const trimmed = value.trim()
  if (trimmed.length <= MAX_OUTPUT_CHARS) {
    return { text: trimmed, truncated: false }
  }
  return { text: trimmed.slice(-MAX_OUTPUT_CHARS), truncated: true }
}

function redactSecrets(value: string, secrets: readonly string[]): string {
  let out = value
  for (const secret of secrets) {
    if (secret.length > 0) {
      out = out.split(secret).join('***')
    }
  }
  return out
}

export async function executeSiteWpCliAction(args: {
  site: Site
  actionId: string
  environment?: string
  confirmed: boolean
}): Promise<SiteWpCliResult> {
  const action = getSiteWpCliAction(args.actionId)
  if (!action) {
    return { ok: false, message: 'Unknown WP-CLI action.' }
  }
  const { site } = args
  if (args.environment && !Object.hasOwn(site.environments, args.environment)) {
    return { ok: false, message: `Environment '${args.environment}' not found for this site.` }
  }

  const summary = await buildSiteSummary(site)
  const plan = buildSiteToolPlan({
    site,
    // 'deploy' for the same reason the MCP tool uses it: the command reaches the live host the
    // way a deploy does, and the group only shapes refusal wording.
    group: 'deploy',
    step: { key: 'wp-cli', label: action.label, remote: true },
    branch: summary.branch,
    requestedEnvironment: args.environment ?? null,
    hasSshSecret: (environment) => getSiteSecretPresence(site.id, environment).ssh,
    pathExists: summary.pathExists
  })
  if (!canStartRun(plan, args.confirmed) || !plan.environment) {
    return {
      ok: false,
      blocked: true,
      needsConfirmation: plan.confirmable,
      environment: plan.environment ?? undefined,
      message: plan.blockedBy.includes('missing-ssh-credentials')
        ? `No SSH password is stored for '${plan.environment ?? '(none)'}'.`
        : plan.blockedBy.includes('unmatched-branch')
          ? `Branch '${summary.branch ?? '(none)'}' matches no environment; this would run on '${plan.environment}'.`
          : 'This site has no environment to run against.'
    }
  }

  const config = buildSiteRunConfig(site, plan.environment, 'deploy')
  const controller = new AbortController()
  const session = await createSiteSshSession(config, controller.signal)
  try {
    const root = quoteShellArgument(config.environment.rootPath)
    const result = await session.exec(`cd ${root} && ${action.command}`, {
      timeoutMs: WP_CLI_TIMEOUT_MS
    })
    const secrets = [config.sshPassword, config.dbPassword]
    const merged = [result.stdout, result.stderr].filter((part) => part.trim().length > 0)
    const output = clampOutput(redactSecrets(merged.join('\n'), secrets))
    return {
      ok: result.code === 0,
      environment: plan.environment,
      exitCode: result.code,
      output: output.text,
      truncated: output.truncated
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}
