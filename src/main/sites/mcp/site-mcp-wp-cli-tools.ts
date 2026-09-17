// run_wp_cli / run_remote_wp_cli: argv WP-CLI, ocsites names, existing runner.
//
// eval / eval-file / shell stay banned. ACF writes go through update_wp_fields; leftover PHP
// through wp_eval_file.

import { readBoolean, readNumber, readStringArray, type ToolArguments } from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { CONFIRM_PROPERTY, ENV_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'
import { openMcpRemoteWp, redactSecrets, resolveMcpLocalWp } from './site-mcp-wp-target'
import { runLocalWpCli, runRemoteWpCli, WP_CLI_MAX_ARGS } from '../wp-cli-runner'

const WP_CLI_ARGS_PROPERTY = {
  args: {
    type: 'array',
    items: { type: 'string' },
    description:
      'WP-CLI argv after `wp`, e.g. ["option","get","home"]. No shell string. eval / eval-file / shell are refused — use update_wp_fields or wp_eval_file.'
  },
  allow_writes: {
    type: 'boolean',
    description: 'Required for anything that is not on the read-only allowlist. Default false.'
  },
  timeout_ms: {
    type: 'integer',
    description: 'Clamped to 5–120 seconds. Default 60s.'
  }
} as const

function readCliArgs(args: ToolArguments): {
  argv: string[]
  allowWrites: boolean
  timeoutMs: number
} {
  return {
    argv: readStringArray(args, 'args', WP_CLI_MAX_ARGS, 512),
    allowWrites: readBoolean(args, 'allow_writes'),
    timeoutMs: readNumber(args, 'timeout_ms', 60_000, 120_000)
  }
}

async function runLocal(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const { site, wpDir, dbSocket } = resolveMcpLocalWp(context, args)
  const { argv, allowWrites, timeoutMs } = readCliArgs(args)
  const result = await runLocalWpCli({
    cwd: wpDir,
    args: argv,
    allowWrites,
    timeoutMs,
    ...(dbSocket ? { dbSocket } : {})
  })
  return {
    ok: !result.blocked && result.code === 0,
    location: 'local',
    site: site.displayName,
    site_id: site.id,
    environment: null,
    wp_root: wpDir,
    blocked: result.blocked,
    safety_reason: result.safetyReason,
    command: result.command,
    exit_code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    output_truncated: result.stdoutTruncated || result.stderrTruncated
  }
}

async function runRemote(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const { argv, allowWrites, timeoutMs } = readCliArgs(args)
  const opened = await openMcpRemoteWp(context, args, {
    key: 'wp-cli',
    label: 'Remote WP-CLI'
  })
  if (!opened.ok) {
    return opened.blocked
  }
  const { site, environment, config, session, layout } = opened.target
  try {
    const result = await runRemoteWpCli(session, {
      rootPath: layout.webroot,
      args: argv,
      allowWrites,
      timeoutMs,
      environment
    })
    const secrets = [config.sshPassword, config.dbPassword]
    return {
      ok: !result.blocked && result.code === 0,
      location: 'remote',
      site: site.displayName,
      site_id: site.id,
      environment,
      host: `${config.environment.username}@${config.environment.hostname}`,
      wp_root: layout.webroot,
      blocked: result.blocked,
      safety_reason: result.safetyReason,
      command: result.command,
      exit_code: result.code,
      stdout: redactSecrets(result.stdout, secrets),
      stderr: redactSecrets(result.stderr, secrets),
      output_truncated: result.stdoutTruncated || result.stderrTruncated
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}

export const SITE_MCP_WP_CLI_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'run_wp_cli',
    description:
      "Run WP-CLI against this site's local WordPress root (path + localWpRoot) with argv, not a shell string. Read-only by default; pass allow_writes=true after the user agrees to a change. eval / eval-file / shell are never allowed — use update_wp_fields or wp_eval_file. Does not take env: local is the checkout, not an environment.",
    inputSchema: objectSchema({ ...WP_CLI_ARGS_PROPERTY, ...SITE_PROPERTY }, ['args']),
    run: runLocal
  },
  {
    name: 'run_remote_wp_cli',
    description:
      "Run WP-CLI on a site's remote host, cd'd into the resolved WordPress webroot (Bedrock-aware). Same argv + read-allowlist as run_wp_cli. With env omitted the environment is inferred from the checked-out branch; a branch matching no environment REFUSES unless env= or confirm=true. eval / eval-file / shell are never allowed.",
    inputSchema: objectSchema(
      { ...WP_CLI_ARGS_PROPERTY, ...SITE_PROPERTY, ...ENV_PROPERTY, ...CONFIRM_PROPERTY },
      ['args']
    ),
    run: runRemote
  }
]
