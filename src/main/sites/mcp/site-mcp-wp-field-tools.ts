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
import { withPhpOpenTag, WP_EVAL_FILE_MAX_BYTES } from '../wp-eval-file'
import {
  readBoolean,
  readLocation,
  readLongString,
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
  const transport = await runEval(
    context,
    args,
    readLocation(args),
    'WP eval-file',
    body,
    undefined,
    extra
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
      "Read ACF field values on local or remote WordPress. Required location: 'local' (this site's WP root) or 'remote' (environment host; unmatched branch refuses unless env= or confirm=true). Paths are dotted and 0-based: modules.0 is the first flex row, spacing_templates.9.name matches options_spacing_templates_9_name. A missing field name is an error, not an empty option. A container path (flex row, repeater, group) returns its values keyed by sub-field name, and modules.N.acf_fc_layout reads that row's layout. A * segment reads every row at that position: modules.*.section_id returns one result for the pattern with count and matches: [{index_path, path, value, field: {key, type}}], plus skipped: [{index_path, layout}] for rows whose layout has no such sub-field. Each pattern counts as one of the 40 paths and is read-only. Set describe: true to see the shape of a target instead of its values, or checksum: true for digests. location 'both' reads local and the resolved environment and returns one comparison: differs_count at the top, then per path {path, field?, local, remote, differs}, or for a pattern {path, field, count, matches: [{index_path, local, remote, differs}], only_local, only_remote}. differs is null where one side errored, exists says which side is missing, and a side's own error stays under that side. Gutenberg ACF blocks are refused.",
    inputSchema: objectSchema(
      {
        ...COMPARE_LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        ...TARGETS_PROPERTY,
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Dotted 0-based ACF paths, e.g. ["modules.6.bottom_spacing"] or ["modules.*.acf_fc_layout"]. Required unless describe or checksum is true, where it names the roots or containers to cover and takes no wildcards.'
        },
        describe: {
          type: 'boolean',
          description:
            "Default false. true returns each path's shape instead of its value: field, rows for a repeater or flexible field, sub_fields for a repeater or group, layouts with their own sub_fields for a flexible field, and row_layouts giving every row's index and layout. Omit fields to describe every field on the target. Labels are plain text cut to 80 characters, and a clone shows as {name, type: 'clone'} beside the children it flattened, wherever ACF nests them."
        },
        checksum: {
          type: 'boolean',
          description:
            "Default false. true answers {path, digest} per path instead of values; a failed path is {path, exists: false, error} and a wildcard is refused. Omit fields to digest every usable root and get target_digest as well. The digest is sha1 of the JSON form of the walker-normalised value: associative keys sorted recursively, lists in order, scalars compared as strings, anything ACF treats as empty removed so absent, null and '' are one state, slashes and unicode unescaped. target_digest is the same hash over the key-sorted map of root name to root digest. Both hosts run the same walker, so digests compare across them; pair it with location 'both' to ask whether staging still matches."
        },
        layout_filter: {
          type: 'string',
          description:
            'Only with describe: true. One flexible-content layout name, which narrows the answer to that layout: layouts holds only it and row_layouts only its rows, while rows still counts the whole field and where: {layout, indexes} lists the rows using it. An unknown name is a per-path error listing the real ones.'
        },
        ...RETURN_PROPERTY,
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location']
    ),
    run: getWpFields
  },
  {
    name: 'update_wp_fields',
    description:
      "Preview or apply ACF field writes via update_field (never raw wp option update). Required location local|remote. Paths are 0-based. apply defaults to false (preview, returns old→new). apply=true writes; a typo'd field name or a bad row operation is a hard error and nothing is written. fields sets leaf values, rows adds, removes, reorders or copies rows of a repeater or flexible field; pass either or both. ok is false when nothing was applied because a path failed; a preview keeps ok true. apply is true whenever writes were issued, and each result row's applied says whether the re-read matched: a mismatch warns 'write issued but the re-read did not match: <path>' and keeps that path out of revert. Every result row and op carries its own warnings, and the mismatch warning lands there as well as at the top level. Preview and apply both return revert: {target, fields: [{path, value}], rows: [op, …]}, already in reverse application order, and an apply also returns revert_token, which update_wp_fields undo=<token> replays later from any session. To undo, replay revert.rows as rows with apply=true first, then revert.fields as fields with apply=true, because row operations move the indexes a field path uses. targets writes the same fields and rows to up to 20 targets in one run; each target is atomic on its own, not across targets, and ok is true only when every one succeeded. location stays local or remote here; use get_wp_fields for 'both'. After apply, page-cache plugins may still serve stale HTML. Gutenberg ACF blocks are refused.",
    inputSchema: objectSchema(
      {
        ...LOCATION_PROPERTY,
        ...TARGET_PROPERTY,
        ...TARGETS_PROPERTY,
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
        undo: {
          type: 'string',
          description:
            'Replay a stored revert by its token, taking no fields, rows or targets. It honours apply, so a preview previews the undo, and it runs the rows half before the fields half. Muster checksums the roots the original write touched and refuses if any changed since, rather than writing over an edit somebody else made. A token replays once. list_wp_reverts shows what is held.'
        },
        ...RETURN_PROPERTY,
        ...SITE_PROPERTY,
        ...ENV_PROPERTY,
        ...CONFIRM_PROPERTY
      },
      ['location']
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
