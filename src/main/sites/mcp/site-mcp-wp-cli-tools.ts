// run_wp_cli / run_remote_wp_cli: argv WP-CLI, ocsites names, existing runner.
//
// eval / eval-file / shell stay banned. ACF writes go through update_wp_fields; leftover PHP
// through wp_eval_file.

import { readBoolean, readNumber, readStringArray, type ToolArguments } from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import { withProgressHeartbeat } from './site-mcp-progress'
import { CONFIRM_PROPERTY, ENV_PROPERTY, objectSchema, SITE_PROPERTY } from './site-mcp-schemas'
import { openMcpRemoteWp, redactSecrets, resolveMcpLocalWp } from './site-mcp-wp-target'
import {
  runLocalWpCli,
  runRemoteWpCli,
  WP_CLI_MAX_ARGS,
  WP_CLI_MAX_OUTPUT_CHARS,
  WP_CLI_MIN_OUTPUT_CHARS
} from '../wp-cli-runner'

const DEFAULT_WP_CLI_MCP_OUTPUT_CHARS = 20_000

const WP_CLI_ARGS_PROPERTY = {
  args: {
    type: 'array',
    items: { type: 'string' },
    description:
      'WP-CLI argv after `wp` (no shell string; eval/eval-file/shell refused — use update_wp_fields or wp_eval_file).'
  },
  allow_writes: {
    type: 'boolean',
    description: 'Required outside the read-only allowlist. Default false.'
  },
  timeout_ms: {
    type: 'integer',
    description: 'Clamped 5000–120000 ms (default 60000).'
  },
  max_output_chars: {
    type: 'integer',
    description: 'Per-stream limit, clamped 1000–50000 (default 20000).'
  },
  tail: {
    type: 'boolean',
    description: 'Keep tail instead of head when truncated (default false).'
  }
} as const

function readCliArgs(args: ToolArguments): {
  argv: string[]
  allowWrites: boolean
  timeoutMs: number
  maxOutputChars: number
  tail: boolean
} {
  return {
    argv: readStringArray(args, 'args', WP_CLI_MAX_ARGS, 512),
    allowWrites: readBoolean(args, 'allow_writes'),
    timeoutMs: readNumber(args, 'timeout_ms', 60_000, 120_000),
    maxOutputChars: readNumber(
      args,
      'max_output_chars',
      DEFAULT_WP_CLI_MCP_OUTPUT_CHARS,
      WP_CLI_MAX_OUTPUT_CHARS,
      WP_CLI_MIN_OUTPUT_CHARS
    ),
    tail: readBoolean(args, 'tail', false)
  }
}

async function runLocal(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const { site, wpDir, dbSocket } = resolveMcpLocalWp(context, args)
  const { argv, allowWrites, timeoutMs, maxOutputChars, tail } = readCliArgs(args)
  const result = await withProgressHeartbeat(context, 'Local WP-CLI', () =>
    runLocalWpCli({
      cwd: wpDir,
      args: argv,
      allowWrites,
      timeoutMs,
      maxOutputChars,
      tail,
      localStack: site.localStack,
      ...(dbSocket ? { dbSocket } : {})
    })
  )
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
  const { argv, allowWrites, timeoutMs, maxOutputChars, tail } = readCliArgs(args)
  return withProgressHeartbeat(context, 'Remote WP-CLI', async () => {
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
        maxOutputChars,
        tail,
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
  })
}

export const SITE_MCP_WP_CLI_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'run_wp_cli',
    description:
      'Run WP-CLI locally (path + localWpRoot) with argv. Read-only unless allow_writes=true; eval/eval-file/shell banned (use update_wp_fields or wp_eval_file). Takes no env.',
    inputSchema: objectSchema({ ...WP_CLI_ARGS_PROPERTY, ...SITE_PROPERTY }, ['args']),
    concurrent: true,
    run: runLocal
  },
  {
    name: 'run_remote_wp_cli',
    description:
      'Run WP-CLI remotely in the resolved webroot (Bedrock-aware) with argv. Read-only unless allow_writes=true; unmatched branch refuses unless env= or confirm=true. eval/eval-file/shell banned.',
    inputSchema: objectSchema(
      { ...WP_CLI_ARGS_PROPERTY, ...SITE_PROPERTY, ...ENV_PROPERTY, ...CONFIRM_PROPERTY },
      ['args']
    ),
    concurrent: true,
    run: runRemote
  }
]
