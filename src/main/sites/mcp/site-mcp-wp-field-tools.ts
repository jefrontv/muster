// get_wp_fields / update_wp_fields / wp_eval_file.
//
// Field writes go through the bundled PHP walker via eval-file (never wp option update).
// location is required: local is the checkout, remote is an environment host.

import { compareAcfEnvelopes } from '../wp-acf-compare'
import {
  ACF_FIELDS_PHP,
  buildAcfPayload,
  readAcfReturnMode,
  readAcfWrites
} from '../wp-acf-payload'
import { readAcfGetLocation, readAcfGetRequest } from '../wp-acf-read-request'
import { readAcfRowOps } from '../wp-acf-row-ops'
import { readAcfTargetSelection } from '../wp-acf-target'
import { WP_CLI_MAX_OUTPUT_CHARS, WP_CLI_MIN_OUTPUT_CHARS } from '../wp-cli-runner'
import { withPhpOpenTag, WP_EVAL_FILE_MAX_BYTES } from '../wp-eval-file'
import {
  readBoolean,
  readLocation,
  readLongString,
  readNumber,
  readOptionalStringArray,
  readString,
  SiteMcpToolError,
  type ToolArguments
} from './site-mcp-arguments'
import type { SiteMcpContext, SiteMcpTool } from './site-mcp-context'
import {
  COMPARE_LOCATION_PROPERTY,
  CONFIRM_PROPERTY,
  ENV_PROPERTY,
  LOCATION_PROPERTY,
  objectSchema,
  RETURN_PROPERTY,
  SITE_PROPERTY,
  TARGET_PROPERTY,
  TARGETS_PROPERTY
} from './site-mcp-schemas'
import { fieldResult, runEval } from './site-mcp-wp-eval-run'
import { runAcfUndo, storeAcfRevert } from './site-mcp-wp-undo'

const DEFAULT_EVAL_OUTPUT_CHARS = 20_000

async function getWpFields(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  const location = readAcfGetLocation(args)
  const selection = readAcfTargetSelection(args)
  const returnMode = readAcfReturnMode(args)
  if (location === 'both' && 'targets' in selection) {
    throw new SiteMcpToolError("'targets' cannot be combined with location 'both'.")
  }
  const sidecar = buildAcfPayload({ ...selection, ...readAcfGetRequest(args), returnMode })
  const read = async (side: 'local' | 'remote'): Promise<Record<string, unknown>> =>
    fieldResult(
      await runEval(context, args, side, 'Get ACF fields', ACF_FIELDS_PHP, sidecar),
      returnMode
    )
  if (location !== 'both') {
    return read(location)
  }
  const local = await read('local')
  const remote = await read('remote')
  // A blocked remote side is the whole answer: there is nothing to compare against.
  return remote.blocked === true ? remote : compareAcfEnvelopes(local, remote)
}

async function updateWpFields(
  context: SiteMcpContext,
  args: ToolArguments
): Promise<Record<string, unknown>> {
  if (readString(args, 'undo').length > 0) {
    if (args.fields !== undefined || args.rows !== undefined || args.targets !== undefined) {
      throw new SiteMcpToolError(
        "'undo' replays a stored revert, so it takes no fields, rows or targets."
      )
    }
    return runAcfUndo(context, args)
  }
  const apply = readBoolean(args, 'apply')
  const fields = readAcfWrites(args)
  const rows = readAcfRowOps(args)
  if (fields.length === 0 && rows.length === 0) {
    throw new SiteMcpToolError("'fields' or 'rows' must list at least one change.")
  }
  const returnMode = readAcfReturnMode(args)
  const selection = readAcfTargetSelection(args)
  const sidecar = buildAcfPayload({
    mode: apply ? 'apply' : 'preview',
    ...selection,
    fields,
    rows,
    returnMode
  })
  const transport = await runEval(
    context,
    args,
    readLocation(args),
    'Update ACF fields',
    ACF_FIELDS_PHP,
    sidecar
  )
  const result = fieldResult(transport, returnMode)
  if (!apply || result.ok !== true) {
    return result
  }
  const token = storeAcfRevert(context.acfState, {
    envelope: result,
    transport,
    target: 'target' in selection ? selection.target : selection.targets
  })
  return token === undefined ? result : { ...result, revert_token: token }
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
  const maxOutputChars = readNumber(
    args,
    'max_output_chars',
    DEFAULT_EVAL_OUTPUT_CHARS,
    WP_CLI_MAX_OUTPUT_CHARS,
    WP_CLI_MIN_OUTPUT_CHARS
  )
  const tail = readBoolean(args, 'tail', false)
  const transport = await runEval(
    context,
    args,
    readLocation(args),
    'WP eval-file',
    body,
    undefined,
    extra,
    { maxOutputChars, tail }
  )
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
      "Read ACF fields locally or remotely (location='both' compares them and reports differs_count). Use dotted 0-based paths (modules.0, modules.*.section_id, modules.N.acf_fc_layout; max 40 paths). Wildcards expand matching rows with skipped layouts and support offset/limit paging; max_value_chars truncates huge string values on get. describe=true returns schema/row layouts instead of values; checksum=true returns SHA-1 digests. Unmatched remote branch refuses unless env= or confirm=true. Gutenberg blocks refused.",
    inputSchema: objectSchema(
      {
        ...COMPARE_LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        ...TARGETS_PROPERTY,
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Dotted 0-based ACF paths (max 40). Required for get; optional root/container names for describe/checksum (no wildcards).'
        },
        describe: {
          type: 'boolean',
          description:
            'Default false. true returns field schema, layouts, sub_fields, and row_layouts (omit fields for all groups).'
        },
        checksum: {
          type: 'boolean',
          description:
            'Default false. true returns normalized SHA-1 digests per path (omit fields for target_digest).'
        },
        layout_filter: {
          type: 'string',
          description:
            'With describe=true: narrow output and row_layouts/where.indexes to one flexible-content layout.'
        },
        max_value_chars: {
          type: 'integer',
          description:
            'For get mode only (50–100000): truncate returned string values to avoid blowing response limits.'
        },
        offset: {
          type: 'integer',
          description: 'For wildcard get reads (0–100000): match index to start from.'
        },
        limit: {
          type: 'integer',
          description: 'For wildcard get reads (1–2000): max matches to return per page.'
        },
        ...RETURN_PROPERTY,
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location']
    ),
    concurrent: true,
    run: getWpFields
  },
  {
    name: 'update_wp_fields',
    description:
      'Preview (apply=false) or apply ACF field/row updates via update_field (never raw option updates). Bad paths/ops abort the whole target atomically. Supports leaf fields, row ops (append/insert/delete/move/duplicate), multi-target (up to 20 atomic per target), and undo=<token> from previous apply/list_wp_reverts (verified by root checksum; replays once). Gutenberg blocks refused.',
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        ...TARGETS_PROPERTY,
        fields: {
          type: 'array',
          description:
            '[{path, value}, …] using ACF input format (e.g. image=ID). No wildcards; optional if rows is provided.'
        },
        rows: {
          type: 'array',
          description:
            'Up to 40 row ops on repeater/flexible containers: {op: append|insert|delete|move|duplicate, path, index?, to?, layout?, values?}. Runs atomically with fields and emits revert ops.'
        },
        apply: {
          type: 'boolean',
          description: 'Default false = preview. true writes via update_field on the root field.'
        },
        undo: {
          type: 'string',
          description:
            'Replay a stored revert token (takes no fields/rows/targets; honors apply; verifies root checksums before writing).'
        },
        ...RETURN_PROPERTY,
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location']
    ),
    concurrent: true,
    run: updateWpFields
  },
  {
    name: 'wp_eval_file',
    description:
      'Run a PHP body (up to 64 KB) via `wp eval-file` locally or remotely and clean up the temp file afterwards (opening <?php tag added if omitted). Prefer update_wp_fields for ACF edits. Tell the user before confirm on production.',
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        php: {
          type: 'string',
          description: 'PHP code (max 64 KB; <?php prepended if absent).'
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra argv forwarded to the file as WP-CLI $args.'
        },
        max_output_chars: {
          type: 'integer',
          description: 'Per-stream limit, clamped 1000–50000 (default 20000).'
        },
        tail: {
          type: 'boolean',
          description: 'Keep tail instead of head when truncated (default false).'
        },
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location', 'php']
    ),
    concurrent: true,
    run: wpEvalFile
  }
]
