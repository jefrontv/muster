// get_wp_fields / update_wp_fields / wp_eval_file.
//
// Field writes go through the bundled PHP walker via eval-file (never wp option update).
// location is required: local is the checkout, remote is an environment host.

import {
  ACF_FIELDS_PHP,
  buildAcfPayload,
  parseAcfRunnerOutcome,
  readAcfTarget,
  readAcfWrites
} from '../wp-acf-payload'
import { readAcfGetRequest } from '../wp-acf-read-request'
import { readAcfRowOps } from '../wp-acf-row-ops'
import {
  runLocalWpEvalFile,
  runRemoteWpEvalFile,
  withPhpOpenTag,
  WP_EVAL_BUNDLED_MAX_BYTES,
  WP_EVAL_BUNDLED_MAX_OUTPUT_CHARS,
  WP_EVAL_FILE_MAX_BYTES
} from '../wp-eval-file'
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
  SITE_PROPERTY,
  TARGET_PROPERTY
} from './site-mcp-schemas'
import { openMcpRemoteWp, redactSecrets, resolveMcpLocalWp } from './site-mcp-wp-target'

async function runEval(
  context: SiteMcpContext,
  args: ToolArguments,
  stepLabel: string,
  php: string,
  sidecar?: string,
  extraArgs: readonly string[] = []
): Promise<Record<string, unknown>> {
  const location = readLocation(args)
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
      maxPhpBytes,
      maxOutputChars,
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
  const sidecar = buildAcfPayload({ target: readAcfTarget(args), ...readAcfGetRequest(args) })
  return fieldResult(await runEval(context, args, 'Get ACF fields', ACF_FIELDS_PHP, sidecar))
}

async function updateWpFields(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const apply = readBoolean(args, 'apply')
  const fields = readAcfWrites(args)
  const rows = readAcfRowOps(args)
  if (fields.length === 0 && rows.length === 0) {
    throw new SiteMcpToolError("'fields' or 'rows' must list at least one change.")
  }
  const sidecar = buildAcfPayload({
    mode: apply ? 'apply' : 'preview',
    target: readAcfTarget(args),
    fields,
    rows
  })
  return fieldResult(await runEval(context, args, 'Update ACF fields', ACF_FIELDS_PHP, sidecar))
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
      "Read ACF field values on local or remote WordPress. Required location: 'local' (this site's WP root) or 'remote' (environment host; unmatched branch refuses unless env= or confirm=true). Paths are dotted and 0-based: modules.0 is the first flex row, spacing_templates.9.name matches options_spacing_templates_9_name. A missing field name is an error, not an empty option. A container path (flex row, repeater, group) returns its values keyed by sub-field name, and modules.N.acf_fc_layout reads that row's layout. A * segment reads every row at that position: modules.*.section_id returns one result for the pattern with count and matches: [{index_path, path, value, field: {key, type}}], plus skipped: [{index_path, layout}] for rows whose layout has no such sub-field. Each pattern counts as one of the 40 paths and is read-only. Set describe: true to see the shape of a target instead of its values. Gutenberg ACF blocks are refused.",
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Dotted 0-based ACF paths, e.g. ["modules.6.bottom_spacing"] or ["modules.*.acf_fc_layout"]. Required unless describe is true, where it names the roots or containers to describe and takes no wildcards.'
        },
        describe: {
          type: 'boolean',
          description:
            "Default false. true returns each path's shape instead of its value: field, rows for a repeater or flexible field, sub_fields for a repeater or group, layouts with their own sub_fields for a flexible field, and row_layouts giving every row's index and layout. Omit fields to describe every field on the target. Labels are plain text cut to 80 characters, and a clone shows as {name, type: 'clone'} beside the children it flattened, wherever ACF nests them."
        },
        layout_filter: {
          type: 'string',
          description:
            'Only with describe: true. One flexible-content layout name, which narrows the answer to that layout: layouts holds only it and row_layouts only its rows, while rows still counts the whole field and where: {layout, indexes} lists the rows using it. An unknown name is a per-path error listing the real ones.'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location', 'target']
    ),
    run: getWpFields
  },
  {
    name: 'update_wp_fields',
    description:
      "Preview or apply ACF field writes via update_field (never raw wp option update). Required location local|remote. Paths are 0-based. apply defaults to false (preview, returns old→new). apply=true writes; a typo'd field name or a bad row operation is a hard error and nothing is written. fields sets leaf values, rows adds, removes, reorders or copies rows of a repeater or flexible field; pass either or both. ok is false when nothing was applied because a path failed; a preview keeps ok true. apply is true whenever writes were issued, and each result row's applied says whether the re-read matched: a mismatch warns 'write issued but the re-read did not match: <path>' and keeps that path out of revert. Every result row carries its own warnings as well. Preview and apply both return revert: {target, fields: [{path, value}], rows: [op, …]}, already in reverse application order. To undo, replay revert.rows as rows with apply=true first, then revert.fields as fields with apply=true, because row operations move the indexes a field path uses. After apply, page-cache plugins may still serve stale HTML. Gutenberg ACF blocks are refused.",
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        fields: {
          type: 'array',
          description:
            '[{path, value}, …]. value is JSON in ACF input format (image = ID, not the array get_field returns). Optional when rows is given. Wildcard paths are refused here; expand them with get_wp_fields first.'
        },
        rows: {
          type: 'array',
          description:
            "Row operations, at most 40. path names the repeater or flexible field itself, never one of its rows. append adds a row at the end: {op:'append', path, layout, values}. insert puts one at index and shifts the rest down: {op:'insert', path, index, layout, values}. delete removes the row at index: {op:'delete', path, index}. move takes the row at index and puts it at to: {op:'move', path, index, to}. duplicate copies the row at index to to, or to just after it: {op:'duplicate', path, index, to}. layout names the flexible-content layout; it is required for a flexible field and refused for a repeater. values are keyed by sub-field name and omitted sub-fields keep ACF's defaults. Previewed unless apply=true, applied atomically alongside fields, and undone with the same revert payload. The response carries a top-level rows array beside results, one entry per operation: op, path, before_count, after_count, row_layouts, applied, and error when one failed. The counts are that op's own, in sequence, and row_layouts lists only the row it touched: the landing row for append, insert and duplicate, the row at to for move, nothing for delete. Use describe or modules.*.acf_fc_layout for the whole list. applied is a subset match, so sub-fields ACF filled in for you are ignored."
        },
        apply: {
          type: 'boolean',
          description: 'Default false = preview. true writes via update_field on the root field.'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location', 'target']
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
