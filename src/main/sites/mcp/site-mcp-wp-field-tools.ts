// get_wp_fields / update_wp_fields / wp_eval_file.
//
// Field writes go through the bundled PHP walker via eval-file (never wp option update).
// location is required: local is the checkout, remote is an environment host.

import {
  ACF_FIELDS_PHP,
  buildAcfPayload,
  parseAcfRunnerOutcome,
  readAcfGetPaths,
  readAcfTarget,
  readAcfWrites
} from '../wp-acf-payload'
import { runLocalWpEvalFile, runRemoteWpEvalFile, WP_EVAL_FILE_MAX_BYTES } from '../wp-eval-file'
import {
  readBoolean,
  readLocation,
  readLongString,
  readOptionalStringArray,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import {
  CONFIRM_PROPERTY,
  ENV_PROPERTY,
  LOCATION_PROPERTY,
  objectSchema,
  SITE_PROPERTY
} from './site-mcp-schemas'
import { openMcpRemoteWp, redactSecrets, resolveMcpLocalWp } from './site-mcp-wp-target'

const TARGET_PROPERTY = {
  target: {
    type: 'object',
    description:
      "ACF $post_id. kind: option (id optional custom post_id), post, term, user, comment (id required). 'options' is accepted as option."
  }
} as const

async function runEval(
  context: SiteMcpContext,
  args: ToolArguments,
  stepLabel: string,
  php: string,
  sidecar?: string,
  extraArgs: readonly string[] = []
): Promise<Record<string, unknown>> {
  const location = readLocation(args)
  if (location === 'local') {
    const { site, wpDir, dbSocket } = resolveMcpLocalWp(context, args)
    const result = await runLocalWpEvalFile({
      wpDir,
      php,
      sidecar,
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
      output_truncated: result.stdoutTruncated || result.stderrTruncated
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
      output_truncated: result.stdoutTruncated || result.stderrTruncated
    }
  } finally {
    await session.close().catch(() => undefined)
  }
}

function fieldResult(transport: Record<string, unknown>): Record<string, unknown> {
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
    ...(typeof transport.command === 'string' ? { command: transport.command } : {})
  })
  return {
    ...parsed,
    ok: parsed.ok !== false && transport.exit_code === 0,
    location: transport.location,
    site: transport.site,
    site_id: transport.site_id,
    environment: transport.environment ?? null,
    host: transport.host,
    wp_root: transport.wp_root,
    command: transport.command,
    output_truncated: transport.output_truncated
  }
}

async function getWpFields(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const sidecar = buildAcfPayload({
    mode: 'get',
    target: readAcfTarget(args),
    fields: readAcfGetPaths(args)
  })
  return fieldResult(await runEval(context, args, 'Get ACF fields', ACF_FIELDS_PHP, sidecar))
}

async function updateWpFields(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const apply = readBoolean(args, 'apply')
  const sidecar = buildAcfPayload({
    mode: apply ? 'apply' : 'preview',
    target: readAcfTarget(args),
    fields: readAcfWrites(args)
  })
  return fieldResult(await runEval(context, args, 'Update ACF fields', ACF_FIELDS_PHP, sidecar))
}

// WP-CLI includes a tagless eval-file body as plain text and still exits 0, which reads as success.
const PHP_OPEN_TAG = /^\s*(?:<\?php|<\?=)/

function withPhpOpenTag(body: string): string {
  const withoutBom = body.startsWith('\uFEFF') ? body.slice(1) : body
  return PHP_OPEN_TAG.test(withoutBom) ? body : `<?php\n${withoutBom}`
}

async function wpEvalFile(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const php = readLongString(args, 'php', WP_EVAL_FILE_MAX_BYTES)
  if (php.trim().length === 0) {
    throw new SiteMcpToolError("'php' is empty.")
  }
  const body = withPhpOpenTag(php)
  if (Buffer.byteLength(body, 'utf8') > WP_EVAL_FILE_MAX_BYTES) {
    throw new SiteMcpToolError(
      `'php' is over the ${WP_EVAL_FILE_MAX_BYTES}-byte cap, measured after the '<?php' line Muster adds to a tagless body.`
    )
  }
  const extra = readOptionalStringArray(args, 'args', 20, 512)
  const transport = await runEval(context, args, 'WP eval-file', body, undefined, extra)
  if (transport.blocked === true) {
    return transport
  }
  return {
    ok: transport.exit_code === 0,
    location: transport.location,
    site: transport.site,
    site_id: transport.site_id,
    environment: transport.environment ?? null,
    host: transport.host,
    wp_root: transport.wp_root,
    command: transport.command,
    exit_code: transport.exit_code,
    stdout: transport.stdout,
    stderr: transport.stderr,
    output_truncated: transport.output_truncated
  }
}

export const SITE_MCP_WP_FIELD_TOOLS: readonly SiteMcpTool[] = [
  {
    name: 'get_wp_fields',
    description:
      "Read ACF field values on local or remote WordPress. Required location: 'local' (this site's WP root) or 'remote' (environment host; unmatched branch refuses unless env= or confirm=true). Paths are dotted and 0-based: modules.0 is the first flex row, spacing_templates.9.name matches options_spacing_templates_9_name. A missing field name is an error, not an empty option. A container path (flex row, repeater, group) returns its values keyed by sub-field name, and modules.N.acf_fc_layout reads that row's layout. Gutenberg ACF blocks are refused.",
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dotted 0-based ACF paths, e.g. ["modules.6.bottom_spacing"].'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location', 'target', 'fields']
    ),
    run: getWpFields
  },
  {
    name: 'update_wp_fields',
    description:
      "Preview or apply ACF field writes via update_field (never raw wp option update). Required location local|remote. Paths are 0-based. apply defaults to false (preview, returns old→new). apply=true writes; a typo'd field name is a hard error and nothing is written. ok is false when nothing was applied because a path failed; a preview keeps ok true. Preview and apply both return revert: {target, fields: [{path, value}]}. Send revert.fields back as fields with apply=true to undo the write. After apply, page-cache plugins may still serve stale HTML. Gutenberg ACF blocks are refused.",
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        fields: {
          type: 'array',
          description:
            '[{path, value}, …]. value is JSON in ACF input format (image = ID, not the array get_field returns).'
        },
        apply: {
          type: 'boolean',
          description: 'Default false = preview. true writes via update_field on the root field.'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location', 'target', 'fields']
    ),
    run: updateWpFields
  },
  {
    name: 'wp_eval_file',
    description:
      'Run a PHP file body with `wp eval-file` on local or remote WordPress, then delete the temp file. Required location. The opening `<?php` tag is optional: Muster prepends one when the body does not already start with `<?php` or `<?=`. 64KB cap, measured after that line is added. Extra args are argv, not a shell string. Prefer update_wp_fields for ACF. Tell the user what the script does before confirm on a production-ish host. Always cleaned up.',
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        php: {
          type: 'string',
          description:
            'PHP file body (not a path). The opening `<?php` tag is optional and prepended when missing. Max 64KB. Always written to a temp file and deleted after.'
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra argv forwarded to the file as WP-CLI $args.'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location', 'php']
    ),
    run: wpEvalFile
  }
]
