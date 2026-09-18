// Runs a PHP body through `wp eval-file` on the site's local WordPress or on an environment host.
//
// The caller passes the location because a compare runs the same payload on both, so it cannot be
// read from the arguments once per call.

import {
  runLocalWpEvalFile,
  runRemoteWpEvalFile,
  WP_EVAL_BUNDLED_MAX_BYTES,
  WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS,
  WP_EVAL_FILE_MAX_BYTES
} from '../wp-eval-file'
import { ACF_FIELDS_PHP, parseAcfRunnerOutcome, type AcfReturnMode } from '../wp-acf-payload'
import type { ToolArguments } from './site-mcp-arguments'
import type { SiteMcpContext } from './site-mcp-context'
import { openMcpRemoteWp, redactSecrets, resolveMcpLocalWp } from './site-mcp-wp-target'

export async function runEval(
  context: SiteMcpContext,
  args: ToolArguments,
  location: 'local' | 'remote',
  stepLabel: string,
  php: string,
  sidecar?: string,
  extraArgs: readonly string[] = [],
  options: { collectOutputFile?: boolean; maxSidecarBytes?: number } = {}
): Promise<Record<string, unknown>> {
  // The walker is ours and outgrew both agent-facing caps; an agent's script keeps 64 KB in, 50,000 out.
  const bundled = php === ACF_FIELDS_PHP
  const maxPhpBytes = bundled ? WP_EVAL_BUNDLED_MAX_BYTES : WP_EVAL_FILE_MAX_BYTES
  const maxOutputChars = bundled ? WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS : undefined
  if (location === 'local') {
    const { site, wpDir, dbSocket } = resolveMcpLocalWp(context, args)
    const result = await runLocalWpEvalFile({
      wpDir,
      php,
      sidecar,
      maxPhpBytes,
      maxOutputChars,
      ...options,
      args: extraArgs,
      ...(dbSocket ? { dbSocket } : {})
    })
    return {
      location: 'local',
      site: site.displayName,
      site_id: site.id,
      environment: null,
      host: site.localDomain || wpDir,
      wp_root: wpDir,
      exit_code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      command: result.command,
      output_truncated: result.stdoutTruncated || result.stderrTruncated,
      output_file_contents: result.outputFileContents
    }
  }
  const opened = await openMcpRemoteWp(context, args, { key: 'wp-eval-file', label: stepLabel })
  if (!opened.ok) {
    return opened.blocked
  }
  const { site, environment, config, session, layout } = opened.target
  try {
    const result = await runRemoteWpEvalFile(session, {
      webroot: layout.webroot,
      php,
      sidecar,
      maxPhpBytes,
      maxOutputChars,
      ...options,
      args: extraArgs
    })
    const secrets = [config.sshPassword, config.dbPassword]
    return {
      location: 'remote',
      site: site.displayName,
      site_id: site.id,
      environment,
      host: `${config.environment.username}@${config.environment.hostname}`,
      wp_root: layout.webroot,
      exit_code: result.code,
      stdout: redactSecrets(result.stdout, secrets),
      stderr: redactSecrets(result.stderr, secrets),
      command: result.command,
      output_truncated: result.stdoutTruncated || result.stderrTruncated,
      output_file_contents: result.outputFileContents
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}

export function fieldResult(
  transport: Record<string, unknown>,
  returnMode: AcfReturnMode = 'full'
): Record<string, unknown> {
  if (transport.blocked === true) {
    return transport
  }
  // Transport stderr carries the reason wp itself failed; without it the agent only sees empty stdout.
  const parsed = parseAcfRunnerOutcome({
    exitCode: typeof transport.exit_code === 'number' ? transport.exit_code : 0,
    stdout: typeof transport.stdout === 'string' ? transport.stdout : '',
    stderr: typeof transport.stderr === 'string' ? transport.stderr : '',
    location: transport.location === 'remote' ? 'remote' : 'local',
    wpRoot: typeof transport.wp_root === 'string' ? transport.wp_root : '',
    // fieldResult only ever wraps the bundled walker, so the cut it reports is the bundled one.
    outputTruncated: transport.output_truncated === true,
    maxOutputChars: WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS,
    ...(typeof transport.command === 'string' ? { command: transport.command } : {})
  })
  return {
    ...parsed,
    ok: parsed.ok !== false && transport.exit_code === 0,
    location: transport.location,
    site: transport.site,
    environment: transport.environment ?? null,
    output_truncated: transport.output_truncated,
    // 'values' drops the host bookkeeping an agent re-reads on every call of a long comparison.
    ...(returnMode === 'values'
      ? {}
      : {
          site_id: transport.site_id,
          host: transport.host,
          wp_root: transport.wp_root,
          command: transport.command
        })
  }
}
